const { getShippingZoneModel }  = require('../models/ShippingZone');
const { getCourierModel }       = require('../models/Courier');
const { getStoreSettingsModel } = require('../models/StoreSettings');
const { getOrderModel }         = require('../models/Order');
const { getSubOrderModel }      = require('../models/SubOrder');
const shiprocket    = require('../services/shiprocket.service');
const delhivery     = require('../services/delhivery.service');
const pricing       = require('../services/pricing.service');
const { rollupOrderStatus } = require('../utils/orderStatusRollup');

// ─── Zones ───────────────────────────────────────────────────────────────────

exports.listZones = async (req, res, next) => {
  try {
    const ShippingZone = getShippingZoneModel(req.tenantConn);
    const zones = await ShippingZone.find().sort({ sortOrder: 1 });
    res.json({ success: true, data: zones });
  } catch (err) { next(err); }
};

exports.createZone = async (req, res, next) => {
  try {
    const ShippingZone = getShippingZoneModel(req.tenantConn);
    const zone = await ShippingZone.create(req.body);
    res.status(201).json({ success: true, data: zone });
  } catch (err) { next(err); }
};

exports.updateZone = async (req, res, next) => {
  try {
    const ShippingZone = getShippingZoneModel(req.tenantConn);
    const zone = await ShippingZone.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!zone) return res.status(404).json({ success: false, message: 'Zone not found' });
    res.json({ success: true, data: zone });
  } catch (err) { next(err); }
};

exports.removeZone = async (req, res, next) => {
  try {
    const ShippingZone = getShippingZoneModel(req.tenantConn);
    const zone = await ShippingZone.findByIdAndDelete(req.params.id);
    if (!zone) return res.status(404).json({ success: false, message: 'Zone not found' });
    res.json({ success: true, message: 'Zone deleted' });
  } catch (err) { next(err); }
};

// ─── Couriers ─────────────────────────────────────────────────────────────────

exports.listCouriers = async (req, res, next) => {
  try {
    const Courier = getCourierModel(req.tenantConn);
    const couriers = await Courier.find();
    res.json({ success: true, data: couriers });
  } catch (err) { next(err); }
};

exports.toggleCourier = async (req, res, next) => {
  try {
    const Courier = getCourierModel(req.tenantConn);
    const courier = await Courier.findByIdAndUpdate(
      req.params.id,
      [{ $set: { isActive: { $not: '$isActive' } } }],
      { new: true },
    );
    if (!courier) return res.status(404).json({ success: false, message: 'Courier not found' });
    res.json({ success: true, data: courier, message: `${courier.name} ${courier.isActive ? 'enabled' : 'disabled'}` });
  } catch (err) { next(err); }
};

/**
 * PUT /couriers/:id/credentials
 * Body: { apiKey, apiSecret }
 * Delhivery uses apiKey as its static token; Shiprocket uses apiKey=email, apiSecret=password.
 * Clears any cached auth token so the new credentials are used on next request.
 */
exports.updateCourierCredentials = async (req, res, next) => {
  try {
    const { apiKey, apiSecret } = req.body;
    if (!apiKey) return res.status(400).json({ success: false, message: 'apiKey is required' });

    const update = { apiKey, token: null, tokenExpiry: null };
    if (apiSecret !== undefined) update.apiSecret = apiSecret;

    const Courier = getCourierModel(req.tenantConn);
    const courier = await Courier.findByIdAndUpdate(req.params.id, update, { new: true });
    if (!courier) return res.status(404).json({ success: false, message: 'Courier not found' });

    res.json({ success: true, message: 'Credentials updated', data: { name: courier.name, slug: courier.slug } });
  } catch (err) { next(err); }
};

/**
 * POST /couriers/:id/test-connection
 * Validates saved credentials against the courier API.
 */
exports.testCourierConnection = async (req, res, next) => {
  try {
    const Courier = getCourierModel(req.tenantConn);
    const courier = await Courier.findById(req.params.id);
    if (!courier) return res.status(404).json({ success: false, message: 'Courier not found' });

    if (courier.slug === 'shiprocket') {
      await shiprocket.checkServiceability({
        pickup_postcode:   '110001',
        delivery_postcode: '400001',
        weight:            0.5,
        cod:               0,
      });
    } else if (courier.slug === 'delhivery') {
      await delhivery.checkServiceability('400001');
    } else {
      return res.status(400).json({ success: false, message: 'No integration for this courier' });
    }

    res.json({ success: true, message: `${courier.name} connection successful` });
  } catch (err) {
    res.status(400).json({ success: false, message: err.response?.data?.message || err.message });
  }
};

// ─── Settings ─────────────────────────────────────────────────────────────────

exports.getSettings = async (req, res, next) => {
  try {
    const StoreSettings = getStoreSettingsModel(req.tenantConn);
    const settings = await StoreSettings.findOne({ storeId: 'default' }).select('shipping');
    res.json({ success: true, data: settings?.shipping || {} });
  } catch (err) { next(err); }
};

exports.updateSettings = async (req, res, next) => {
  try {
    const prefixed = Object.fromEntries(Object.entries(req.body).map(([k, v]) => [`shipping.${k}`, v]));
    const StoreSettings = getStoreSettingsModel(req.tenantConn);
    const settings = await StoreSettings.findOneAndUpdate(
      { storeId: 'default' },
      { $set: prefixed },
      { new: true, upsert: true },
    );
    res.json({ success: true, data: settings.shipping });
  } catch (err) { next(err); }
};

// ─── Stats ────────────────────────────────────────────────────────────────────

exports.getStats = async (req, res, next) => {
  try {
    const Order = getOrderModel(req.tenantConn);
    const Courier = getCourierModel(req.tenantConn);
    const [shipped, activeCouriers, avgCost] = await Promise.all([
      Order.countDocuments({ status: { $in: ['shipped', 'delivered'] } }),
      Courier.countDocuments({ isActive: true }),
      Order.aggregate([
        { $match: { shippingCost: { $gt: 0 } } },
        { $group: { _id: null, avg: { $avg: '$shippingCost' } } },
      ]),
    ]);
    res.json({
      success: true,
      data: { shipped, activeCouriers, avgShippingCost: Math.round(avgCost[0]?.avg || 0) },
    });
  } catch (err) { next(err); }
};

// ─── Internal rate calculator (used at checkout) ─────────────────────────────

exports.calculateRate = async (req, res, next) => {
  try {
    const { pincode, total, weight } = req.body;
    const { rate, zone, estimatedDays } = await pricing.computeShipping({
      pincode,
      merchandiseTotal: total,
      weight,
    });
    res.json({
      success: true,
      data: rate === 0
        ? { rate, message: 'Free shipping', zone, estimatedDays }
        : { rate, zone, estimatedDays },
    });
  } catch (err) { next(err); }
};

// ─── Shiprocket wallet balance ────────────────────────────────────────────────

exports.getWalletBalance = async (req, res, next) => {
  try {
    const data    = await shiprocket.getWalletBalance();
    const balance = data?.data?.wallet_balance ?? data?.wallet_balance ?? null;
    res.json({ success: true, data: { balance } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ─── Shiprocket pickup locations ─────────────────────────────────────────────

exports.getPickupLocations = async (req, res, next) => {
  try {
    const data = await shiprocket.getPickupLocations();
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ─── Live rates from courier APIs ─────────────────────────────────────────────

/**
 * POST /live-rates
 * Body: { pincode, weight, total, cod, pickupPincode }
 * Calls Shiprocket and/or Delhivery and returns their rate options.
 */
exports.getLiveRates = async (req, res, next) => {
  try {
    const { pincode, weight = 0.5, total = 0, cod = false, pickupPincode = '110001' } = req.body;
    if (!pincode) return res.status(400).json({ success: false, message: 'pincode is required' });

    const results = { shiprocket: null, delhivery: null, errors: {} };

    await Promise.allSettled([
      shiprocket.checkServiceability({
        pickup_postcode:   pickupPincode,
        delivery_postcode: pincode,
        weight,
        cod:               cod ? 1 : 0,
      }).then(d => { results.shiprocket = d?.data?.available_courier_companies || []; }),

      delhivery.checkServiceability(pincode)
        .then(d => { results.delhivery = d?.delivery_codes || []; }),
    ]).then(outcomes => {
      if (outcomes[0].status === 'rejected') results.errors.shiprocket = outcomes[0].reason.message;
      if (outcomes[1].status === 'rejected') results.errors.delhivery  = outcomes[1].reason.message;
    });

    res.json({ success: true, data: results });
  } catch (err) { next(err); }
};

// ─── Book shipment ────────────────────────────────────────────────────────────

/**
 * POST /book-shipment
 * Body: { orderId, courierSlug, courierId, pickupLocation, sellerInfo }
 *   courierSlug: 'shiprocket' | 'delhivery'
 *   courierId:   Shiprocket courier_company_id (optional; auto-picks cheapest if omitted)
 *   pickupLocation: name of the pickup address configured in the courier panel
 *   sellerInfo:  { name, address, city, state, pincode, phone, gst, pickupName }
 */
exports.bookShipment = async (req, res, next) => {
  try {
    const { orderId, courierSlug, courierId, pickupLocation = 'Home', sellerInfo = {} } = req.body;
    if (!orderId || !courierSlug) {
      return res.status(400).json({ success: false, message: 'orderId and courierSlug are required' });
    }

    const Order = getOrderModel(req.tenantConn);
    const order = await Order.findById(orderId).populate('customer', 'name email phone');
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
    if (order.awbCode) {
      return res.status(409).json({ success: false, message: 'Shipment already booked', awbCode: order.awbCode });
    }

    let awbCode, shipmentId, courierName;

    if (courierSlug === 'shiprocket') {
      const created  = await shiprocket.createOrder(order, pickupLocation);
      console.log('[SHIPROCKET] createOrder response:', JSON.stringify(created));

      if (!created.shipment_id) {
        throw new Error(created.message || `Order creation failed: ${JSON.stringify(created)}`);
      }
      shipmentId = String(created.shipment_id);

      const awbResp  = await shiprocket.assignAWB({ shipment_id: shipmentId, courier_id: courierId || undefined });
      console.log('[SHIPROCKET] assignAWB response:', JSON.stringify(awbResp));

      awbCode = awbResp?.response?.data?.awb_code
             || awbResp?.awb_code
             || awbResp?.response?.data?.awb
             || null;

      if (!awbCode) {
        const awbErr = awbResp?.response?.data?.message || awbResp?.message || JSON.stringify(awbResp);
        throw new Error(`AWB assignment failed: ${awbErr}`);
      }

      const partnerName = awbResp?.response?.data?.courier_name || '';
      courierName = partnerName ? `Shiprocket · ${partnerName}` : 'Shiprocket';

      await shiprocket.generatePickup(shipmentId);

    } else if (courierSlug === 'delhivery') {
      const created = await delhivery.createShipment(order, sellerInfo);
      const pkg     = created?.packages?.[0];
      if (!pkg || pkg.status !== 'Success') {
        throw new Error(pkg?.error || 'Delhivery shipment creation failed');
      }
      awbCode     = pkg.waybill;
      shipmentId  = pkg.waybill;
      courierName = 'Delhivery';

    } else {
      return res.status(400).json({ success: false, message: `Unsupported courier: ${courierSlug}` });
    }

    await Order.findByIdAndUpdate(orderId, {
      awbCode,
      shipmentId,
      courierSlug,
      courierName,
      trackingNumber: awbCode,
      status: 'processing',
      $push: { timeline: { status: 'processing', note: `Shipment booked via ${courierName}. AWB: ${awbCode}` } },
    });

    res.json({ success: true, data: { awbCode, shipmentId, courierName } });
  } catch (err) {
    const data = err.response?.data;
    console.error('[BOOK SHIPMENT ERROR]', JSON.stringify(data || err.message, null, 2));
    const msg = data?.message || data?.error || err.message;
    res.status(500).json({ success: false, message: msg, details: data || null });
  }
};

// ─── Public tracking by AWB ───────────────────────────────────────────────────

/**
 * GET /track/awb/:awb  (public — no auth required)
 * Anyone with the AWB/tracking number can check shipment status.
 */
exports.trackByAwb = async (req, res, next) => {
  try {
    const Order = getOrderModel(req.tenantConn);
    const awb   = req.params.awb?.trim();
    const order = await Order.findOne({ awbCode: awb })
      .select('orderNumber status awbCode courierName courierSlug trackingNumber timeline createdAt');

    if (!order) {
      return res.status(404).json({ success: false, message: 'Tracking number not found. Please check and try again.' });
    }

    const response = {
      orderNumber:  order.orderNumber,
      status:       order.status,
      awbCode:      order.awbCode,
      courierName:  order.courierName,
      timeline:     order.timeline,
      placedAt:     order.createdAt,
      liveTracking: null,
    };

    if (order.courierSlug === 'shiprocket') {
      try {
        response.liveTracking = await shiprocket.trackShipment(awb);
      } catch (_) {
        // best-effort; stored timeline is still returned
      }
    }

    res.json({ success: true, data: response });
  } catch (err) { next(err); }
};

// ─── Track shipment ───────────────────────────────────────────────────────────

/**
 * GET /track/:orderId
 * Returns live tracking data from the courier API.
 */
exports.trackOrder = async (req, res, next) => {
  try {
    const Order = getOrderModel(req.tenantConn);
    const order = await Order.findById(req.params.orderId).select('awbCode courierSlug orderNumber');
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
    if (!order.awbCode) return res.status(400).json({ success: false, message: 'No shipment booked for this order' });

    let trackingData;
    if (order.courierSlug === 'shiprocket') {
      trackingData = await shiprocket.trackShipment(order.awbCode);
    } else if (order.courierSlug === 'delhivery') {
      trackingData = await delhivery.trackShipment(order.awbCode);
    } else {
      return res.status(400).json({ success: false, message: 'Unknown courier for this order' });
    }

    res.json({ success: true, data: trackingData });
  } catch (err) {
    const msg = err.response?.data?.message || err.message;
    res.status(500).json({ success: false, message: msg });
  }
};

// ─── Cancel shipment ──────────────────────────────────────────────────────────

/**
 * POST /cancel-shipment
 * Body: { orderId }
 */
exports.cancelShipment = async (req, res, next) => {
  try {
    const { orderId } = req.body;
    if (!orderId) return res.status(400).json({ success: false, message: 'orderId is required' });

    const Order = getOrderModel(req.tenantConn);
    const order = await Order.findById(orderId).select('awbCode courierSlug status');
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
    if (!order.awbCode) return res.status(400).json({ success: false, message: 'No shipment booked for this order' });

    let result;
    if (order.courierSlug === 'shiprocket') {
      result = await shiprocket.cancelShipment(order.awbCode);
    } else if (order.courierSlug === 'delhivery') {
      result = await delhivery.cancelShipment(order.awbCode);
    } else {
      return res.status(400).json({ success: false, message: 'Unknown courier for this order' });
    }

    await Order.findByIdAndUpdate(orderId, {
      status: 'cancelled',
      $push: { timeline: { status: 'cancelled', note: 'Shipment cancelled via courier API' } },
    });

    res.json({ success: true, message: 'Shipment cancelled', data: result });
  } catch (err) {
    const msg = err.response?.data?.message || err.message;
    res.status(500).json({ success: false, message: msg });
  }
};

// ─── Webhooks ─────────────────────────────────────────────────────────────────

/**
 * POST /webhooks/shiprocket
 * Shiprocket sends status update events here.
 * Configure this URL in your Shiprocket panel → Settings → Webhooks.
 */
exports.shiprocketWebhook = async (req, res) => {
  try {
    const Order    = getOrderModel(req.tenantConn);
    const SubOrder = getSubOrderModel(req.tenantConn);
    const { awb, current_status } = req.body || {};
    if (!awb) return res.json({ success: true });

    const internalStatus = shiprocket.mapStatus(current_status);
    if (!internalStatus) return res.json({ success: true });

    // Per-vendor bookings carry their own AWB on the SubOrder — check there
    // first; fall back to the legacy Order-level match for store-owned orders.
    const subOrder = await SubOrder.findOne({ awbCode: awb });
    if (subOrder) {
      if (subOrder.status !== internalStatus) {
        await SubOrder.findByIdAndUpdate(subOrder._id, {
          status: internalStatus,
          $push: { timeline: { status: internalStatus, note: `Shiprocket: ${current_status}` } },
        });
      }
      await rollupOrderStatus(Order, SubOrder, subOrder.order);
    } else {
      const order = await Order.findOne({ awbCode: awb });
      if (order && order.status !== internalStatus) {
        await Order.findByIdAndUpdate(order._id, {
          status: internalStatus,
          $push: { timeline: { status: internalStatus, note: `Shiprocket: ${current_status}` } },
        });
      }
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * POST /webhooks/delhivery
 * Delhivery sends status update events here.
 * Configure this URL in your Delhivery merchant panel → Webhooks.
 */
exports.delhiveryWebhook = async (req, res) => {
  try {
    const Order    = getOrderModel(req.tenantConn);
    const SubOrder = getSubOrderModel(req.tenantConn);
    const packages = req.body?.packages || [];
    for (const pkg of packages) {
      const waybill        = pkg.waybill;
      const internalStatus = delhivery.mapStatus(pkg.status);
      if (!waybill || !internalStatus) continue;

      const note = `Delhivery: ${pkg.status}${pkg.remarks ? ' — ' + pkg.remarks : ''}`;
      const subOrder = await SubOrder.findOne({ awbCode: waybill });
      if (subOrder) {
        if (subOrder.status !== internalStatus) {
          await SubOrder.findByIdAndUpdate(subOrder._id, {
            status: internalStatus,
            $push: { timeline: { status: internalStatus, note } },
          });
        }
        await rollupOrderStatus(Order, SubOrder, subOrder.order);
      } else {
        const order = await Order.findOne({ awbCode: waybill });
        if (order && order.status !== internalStatus) {
          await Order.findByIdAndUpdate(order._id, {
            status: internalStatus,
            $push: { timeline: { status: internalStatus, note } },
          });
        }
      }
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
