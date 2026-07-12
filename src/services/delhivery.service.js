const axios   = require('axios');
const Courier = require('../models/Courier');

const BASE = 'https://track.delhivery.com';

// ─── Auth ────────────────────────────────────────────────────────────────────

// Delhivery uses a static API token — no login/refresh needed.
async function getToken() {
  const courier = await Courier.findOne({ slug: 'delhivery' }).select('+apiKey');
  if (!courier?.apiKey) throw new Error('Delhivery API token not configured');
  return courier.apiKey;
}

function authHeaders(token) {
  return {
    Authorization:  `Token ${token}`,
    'Content-Type': 'application/json',
    Accept:         'application/json',
  };
}

function formHeaders(token) {
  return {
    Authorization:  `Token ${token}`,
    'Content-Type': 'application/x-www-form-urlencoded',
    Accept:         'application/json',
  };
}

// ─── Serviceability ───────────────────────────────────────────────────────────

/**
 * Checks whether a pincode is serviceable by Delhivery.
 * Returns pincode details including supported payment types.
 */
exports.checkServiceability = async (destination_pin) => {
  const token = await getToken();
  const { data } = await axios.get(`${BASE}/c/api/pin-codes/json/`, {
    headers: authHeaders(token),
    params:  { filter_codes: destination_pin },
  });
  return data; // { delivery_codes: [{ postal_code: { pin, city, state_code, ... } }] }
};

// ─── Shipment creation ────────────────────────────────────────────────────────

/**
 * Creates a Delhivery shipment / waybill for a local Order document.
 * waybill can be left '' to let Delhivery auto-assign one.
 */
exports.createShipment = async (order, sellerInfo = {}) => {
  const token = await getToken();
  const addr  = order.shippingAddress;

  const shipment = {
    name:           addr.name    || '',
    add:            [addr.line1, addr.line2].filter(Boolean).join(', '),
    pin:            addr.pincode || '',
    city:           addr.city    || '',
    state:          addr.state   || '',
    country:        addr.country || 'India',
    phone:          addr.phone   || '',
    order:          order.orderNumber,
    payment:        order.paymentMethod === 'cod' ? 'COD' : 'Pre-paid',
    return_pin:     sellerInfo.pincode  || '',
    return_city:    sellerInfo.city     || '',
    return_phone:   sellerInfo.phone    || '',
    return_add:     sellerInfo.address  || '',
    return_state:   sellerInfo.state    || '',
    return_country: 'India',
    products_desc:  order.items.map(i => i.name).join(', '),
    hsn_code:       '',
    cod_amount:     order.paymentMethod === 'cod' ? String(order.total) : '0',
    order_date:     new Date(order.createdAt).toISOString().split('T')[0],
    total_amount:   String(order.total),
    seller_add:     sellerInfo.address  || '',
    seller_name:    sellerInfo.name     || '',
    seller_inv:     order.invoiceNumber || order.orderNumber,
    quantity:       String(order.items.reduce((s, i) => s + i.quantity, 0)),
    waybill:        '',  // auto-assigned
    shipment_width:  '10',
    shipment_height: '10',
    weight:          '0.5',
    seller_gst_tin:  sellerInfo.gst || '',
    shipping_mode:   'Surface',
    address_type:    'home',
  };

  const payload = `format=json&data=${encodeURIComponent(JSON.stringify({
    shipments:       [shipment],
    pickup_location: { name: sellerInfo.pickupName || 'Primary' },
  }))}`;

  const { data } = await axios.post(`${BASE}/api/cmu/create.json`, payload, {
    headers: formHeaders(token),
  });
  return data; // { packages: [{ status, waybill, ... }], ... }
};

// ─── Tracking ─────────────────────────────────────────────────────────────────

exports.trackShipment = async (waybill) => {
  const token = await getToken();
  const { data } = await axios.get(`${BASE}/api/v1/packages/json/`, {
    headers: authHeaders(token),
    params:  { waybill },
  });
  return data; // { ShipmentData: [{ Shipment: { Status, ... } }] }
};

// ─── Cancellation ─────────────────────────────────────────────────────────────

exports.cancelShipment = async (waybill) => {
  const token = await getToken();
  const payload = `format=json&data=${encodeURIComponent(JSON.stringify({
    waybill,
    cancellation: true,
  }))}`;
  const { data } = await axios.post(`${BASE}/api/p/edit`, payload, {
    headers: formHeaders(token),
  });
  return data;
};

// ─── Status map ───────────────────────────────────────────────────────────────

const DELHIVERY_STATUS_MAP = {
  'manifested':          'processing',
  'in transit':          'shipped',
  'out for delivery':    'shipped',
  'delivered':           'delivered',
  'rto initiated':       'cancelled',
  'rto delivered':       'cancelled',
  'lost':                'cancelled',
  'shipment cancelled':  'cancelled',
};

exports.mapStatus = (delhiveryStatus = '') =>
  DELHIVERY_STATUS_MAP[delhiveryStatus.toLowerCase()] ?? null;
