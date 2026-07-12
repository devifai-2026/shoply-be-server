const axios  = require('axios');
const Courier = require('../models/Courier');

const BASE = 'https://apiv2.shiprocket.in/v1/external';

// ─── Auth ────────────────────────────────────────────────────────────────────

async function getToken() {
  const courier = await Courier.findOne({ slug: 'shiprocket' })
    .select('+apiKey +apiSecret +token +tokenExpiry');

  // Prefer DB-stored creds; fall back to env vars
  const email = courier?.apiKey  || process.env.SHIPROCKET_EMAIL;
  const pass  = courier?.apiSecret || process.env.SHIPROCKET_PASS;

  if (!email || !pass) {
    throw new Error('Shiprocket credentials not configured. Add them in Admin → Shipping → Couriers or set SHIPROCKET_EMAIL/SHIPROCKET_PASS in .env');
  }

  // Reuse cached token if it still has >1 hour left
  if (courier?.token && courier?.tokenExpiry && new Date() < new Date(courier.tokenExpiry - 3_600_000)) {
    return courier.token;
  }

  const { data } = await axios.post(`${BASE}/auth/login`, { email, password: pass });

  const token  = data.token;
  const expiry = new Date(Date.now() + 10 * 24 * 3_600_000); // tokens last 10 days

  // Cache to DB if the courier document exists
  if (courier) {
    await Courier.findOneAndUpdate({ slug: 'shiprocket' }, { token, tokenExpiry: expiry });
  }
  return token;
}

function authHeaders(token) {
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

// Clears the cached token so the next call re-authenticates.
async function invalidateToken() {
  await Courier.findOneAndUpdate({ slug: 'shiprocket' }, { token: null, tokenExpiry: null });
}

// Calls fn(token). If Shiprocket returns 401/403 (stale/revoked token),
// invalidates the cache and retries once with a fresh token.
async function withAuth(fn) {
  const token = await getToken();
  try {
    return await fn(token);
  } catch (err) {
    if (err.response?.status === 401 || err.response?.status === 403) {
      await invalidateToken();
      const freshToken = await getToken();
      return await fn(freshToken);
    }
    throw err;
  }
}

// ─── Serviceability / Rates ───────────────────────────────────────────────────

exports.checkServiceability = async ({ pickup_postcode, delivery_postcode, weight, cod = 0 }) => {
  return withAuth(async (token) => {
    const { data } = await axios.get(`${BASE}/courier/serviceability/`, {
      headers: authHeaders(token),
      params:  { pickup_postcode, delivery_postcode, weight, cod },
    });
    return data;
  });
};

// ─── Order creation ───────────────────────────────────────────────────────────

/**
 * Creates a Shiprocket order from a local Order document.
 * `order.customer` should be populated with { name, email, phone }.
 * Returns { order_id, shipment_id, status, ... }.
 */
exports.createOrder = async (order, pickupLocation = 'Primary') => {
  return withAuth(async (token) => {
    const addr    = order.shippingAddress;
    const nameParts = (addr.name || '').trim().split(' ');
    const firstName = nameParts[0] || '';
    const lastName  = nameParts.slice(1).join(' ') || '.';

    const rawPhone      = addr.phone || order.customer?.phone || '';
    const customerPhone = rawPhone.replace(/^\+91/, '').replace(/\D/g, '').slice(-10);
    const customerEmail = order.customer?.email || '';

    const payload = {
      order_id:   order.orderNumber,
      order_date: new Date(order.createdAt).toISOString().replace('T', ' ').slice(0, 16),
      pickup_location: pickupLocation,

      billing_customer_name: firstName,
      billing_last_name:     lastName,
      billing_address:       addr.line1 || addr.line2 || addr.city || 'N/A',
      billing_address_2:     addr.line2   || '',
      billing_city:          addr.city    || '',
      billing_pincode:       addr.pincode || '',
      billing_state:         addr.state   || '',
      billing_country:       'India',
      billing_email:         customerEmail,
      billing_phone:         customerPhone,
      shipping_is_billing:   true,

      order_items: order.items.map(i => ({
        name:          i.name,
        sku:           i.sku,
        units:         i.quantity,
        selling_price: i.discountPrice ?? i.price,
        discount:      i.discountPrice ? (i.price - i.discountPrice) : 0,
        tax:           0,
        hsn:           '',
      })),

      payment_method: order.paymentMethod === 'cod' ? 'COD' : 'Prepaid',
      sub_total:      order.subtotal,
      length:         10,
      breadth:        10,
      height:         10,
      weight:         0.5,
    };

    const { data } = await axios.post(`${BASE}/orders/create/adhoc`, payload, {
      headers: authHeaders(token),
    });
    return data; // { order_id, shipment_id, status, ... }
  });
};

// ─── AWB assignment ───────────────────────────────────────────────────────────

/**
 * Assigns an Air Waybill to a shipment.
 * Pass courier_id from the serviceability response to pick a specific partner,
 * or omit it to let Shiprocket auto-assign.
 */
exports.assignAWB = async ({ shipment_id, courier_id }) => {
  return withAuth(async (token) => {
    const body = { shipment_id };
    if (courier_id) body.courier_id = courier_id;
    const { data } = await axios.post(
      `${BASE}/courier/assign/awb`,
      body,
      { headers: authHeaders(token) },
    );
    return data; // { awb_assign_status, response: { data: { awb_code, ... } } }
  });
};

// ─── Pickup ───────────────────────────────────────────────────────────────────

exports.generatePickup = async (shipment_id) => {
  return withAuth(async (token) => {
    const { data } = await axios.post(
      `${BASE}/courier/generate/pickup`,
      { shipment_id: [shipment_id] },
      { headers: authHeaders(token) },
    );
    return data;
  });
};

// ─── Wallet Balance ───────────────────────────────────────────────────────────

exports.getWalletBalance = async () => {
  return withAuth(async (token) => {
    const { data } = await axios.get(`${BASE}/account/details/wallet-balance`, {
      headers: authHeaders(token),
    });
    return data;
  });
};

// ─── Pickup Locations ─────────────────────────────────────────────────────────

exports.getPickupLocations = async () => {
  return withAuth(async (token) => {
    const { data } = await axios.get(`${BASE}/settings/company/pickup`, {
      headers: authHeaders(token),
    });
    return data;
  });
};

// ─── Tracking ─────────────────────────────────────────────────────────────────

exports.trackShipment = async (awb) => {
  return withAuth(async (token) => {
    const { data } = await axios.get(`${BASE}/courier/track/awb/${awb}`, {
      headers: authHeaders(token),
    });
    return data;
  });
};

// ─── Cancellation ─────────────────────────────────────────────────────────────

exports.cancelShipment = async (awbs) => {
  return withAuth(async (token) => {
    const { data } = await axios.post(
      `${BASE}/orders/cancel/shipment/awbs`,
      { awbs: Array.isArray(awbs) ? awbs : [awbs] },
      { headers: authHeaders(token) },
    );
    return data;
  });
};

// ─── Status map ───────────────────────────────────────────────────────────────

const SHIPROCKET_STATUS_MAP = {
  'new':                  'processing',
  'pending':              'processing',
  'pickup scheduled':     'processing',
  'pickup generated':     'processing',
  'pickup queued':        'processing',
  'in transit':           'shipped',
  'out for delivery':     'shipped',
  'delivered':            'delivered',
  'cancelled':            'cancelled',
  'rto initiated':        'cancelled',
  'rto delivered':        'cancelled',
};

exports.mapStatus = (shiprocketStatus = '') =>
  SHIPROCKET_STATUS_MAP[shiprocketStatus.toLowerCase()] ?? null;
