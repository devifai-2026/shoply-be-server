const Order             = require('../models/Order');
const SubOrder          = require('../models/SubOrder');
const Vendor            = require('../models/Vendor');
const Product           = require('../models/Product');
const Customer          = require('../models/Customer');
const Coupon            = require('../models/Coupon');
const AdminNotification = require('../models/AdminNotification');
const StoreSettings     = require('../models/StoreSettings');
const Courier           = require('../models/Courier');
const shiprocket        = require('../services/shiprocket.service');
const pricing           = require('../services/pricing.service');
const emailService      = require('../services/email.service');

async function autoBookShiprocket(order) {
  const courier = await Courier.findOne({ slug: 'shiprocket', isActive: true });
  if (!courier) return;

  // Populate customer so Shiprocket gets email + phone
  const customer = await Customer.findById(order.customer).select('name email phone').lean();
  const orderWithCustomer = Object.assign(order.toObject ? order.toObject() : { ...order }, { customer });

  let created = await shiprocket.createOrder(orderWithCustomer);

  // Shiprocket returns 200 with error when pickup location name is wrong —
  // extract the correct location from the response and retry once
  if (!created.shipment_id && created.data?.data?.[0]?.pickup_location) {
    const correctLocation = created.data.data[0].pickup_location;
    created = await shiprocket.createOrder(orderWithCustomer, correctLocation);
  }

  if (!created.shipment_id) {
    throw new Error(`Shiprocket createOrder failed: ${created.message || JSON.stringify(created)}`);
  }

  const shipmentId = String(created.shipment_id);
  const awbResp    = await shiprocket.assignAWB({ shipment_id: shipmentId });
  const awbCode    = awbResp?.response?.data?.awb_code || awbResp?.awb_code;

  // Shiprocket auto-schedules pickup on AWB assignment — no need to call generatePickup
  await Order.findByIdAndUpdate(order._id, {
    awbCode,
    shipmentId,
    courierSlug:    'shiprocket',
    courierName:    'Shiprocket',
    trackingNumber: awbCode,
    status:         'processing',
    $push: { timeline: { status: 'processing', note: `Shipment auto-booked via Shiprocket. AWB: ${awbCode}` } },
  });

  if (awbCode) {
    const customer = await Customer.findById(order.customer).select('email name').lean();
    if (customer?.email) {
      await emailService.sendTrackingEmail({
        toEmail: customer.email,
        toName:  customer.name || 'Customer',
        order:   {
          orderNumber:    order.orderNumber,
          awbCode,
          trackingNumber: awbCode,
          courierName:    'Shiprocket',
        },
      });
    }
  }
}

const generateOrderNumber = () => `ORD-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

exports.createOrder = async (req, res, next) => {
  try {
    const customerId = req.customer._id;
    const { items, shippingAddress, paymentMethod, couponCode, platform } = req.body;

    if (!items?.length) {
      return res.status(400).json({ success: false, message: 'Order must have at least one item' });
    }
    if (!shippingAddress || !shippingAddress.pincode) {
      return res.status(400).json({ success: false, message: 'Shipping address with pincode is required' });
    }

    const productIds = items.map(i => i.product);
    const products   = await Product.find({ _id: { $in: productIds } });
    const productMap = Object.fromEntries(products.map(p => [p._id.toString(), p]));

    let subtotal = 0;
    const orderItems = items.map(item => {
      const p = productMap[item.product];
      if (!p) throw Object.assign(new Error(`Product ${item.product} not found`), { statusCode: 404 });
      if (p.stock < item.quantity) throw Object.assign(new Error(`Insufficient stock for ${p.name}`), { statusCode: 400 });
      const price = p.discountPrice || p.price;
      subtotal += price * item.quantity;
      return {
        product:    p._id,
        name:       p.name,
        sku:        p.sku,
        image:      p.images?.[0] || null,
        quantity:   item.quantity,
        price,
        attributes: item.attributes || {},
      };
    });

    const settings    = await StoreSettings.findOne({ storeId: 'default' }).lean();
    const taxRate     = settings?.orders?.taxIncluded ? 0 : (settings?.orders?.gstRate || 0);
    const tax         = Math.round(subtotal * (taxRate / 100));

    // Recompute the coupon discount server-side from the live subtotal —
    // never trust a discount amount sent by the client.
    let couponDiscount = 0;
    let appliedCoupon = null;
    if (couponCode) {
      const coupon = await Coupon.findOne({ code: couponCode.toUpperCase() });
      if (!coupon) {
        return res.status(400).json({ success: false, message: 'Invalid coupon code' });
      }
      const { valid, reason } = coupon.isValid(subtotal, platform || 'web');
      if (!valid) {
        return res.status(400).json({ success: false, message: reason });
      }
      if (coupon.discountType === 'percent') {
        couponDiscount = Math.round(subtotal * (coupon.discountValue / 100));
        if (coupon.maxDiscount) couponDiscount = Math.min(couponDiscount, coupon.maxDiscount);
      } else {
        couponDiscount = coupon.discountValue;
      }
      appliedCoupon = coupon;
    }

    // Shipping is always recomputed server-side from the zone table — the
    // client-quoted value from /calculate-rate is display-only and never trusted.
    const { rate: shippingCost } = await pricing.computeShipping({
      pincode:          shippingAddress.pincode,
      merchandiseTotal: subtotal,
    });

    const total = Math.max(0, subtotal + tax + shippingCost - couponDiscount);

    const order = await Order.create({
      orderNumber:    generateOrderNumber(),
      customer:       customerId,
      items:          orderItems,
      subtotal,
      tax,
      shippingCost,
      discount:       couponDiscount,
      total,
      platform:       String(platform || '').toLowerCase() === 'app' ? 'App' : 'Web',
      shippingAddress,
      paymentMethod:  paymentMethod || 'cod',
      couponCode:     couponCode || null,
      timeline:       [{ status: 'pending', note: 'Order placed' }],
    });

    // ── Marketplace split: one sub-order per vendor ──────────────────────────
    // Store-owned items (product.vendor = null) stay on the parent order only.
    const vendorGroups = new Map();
    for (const item of orderItems) {
      const vendorId = productMap[item.product.toString()]?.vendor?.toString();
      if (!vendorId) continue;
      if (!vendorGroups.has(vendorId)) vendorGroups.set(vendorId, []);
      vendorGroups.get(vendorId).push(item);
    }
    if (vendorGroups.size) {
      const vendors  = await Vendor.find({ _id: { $in: [...vendorGroups.keys()] } })
        .select('commissionRate').lean();
      const rateMap  = Object.fromEntries(vendors.map(v => [v._id.toString(), v.commissionRate || 0]));

      let seq = 0;
      const subOrders = [...vendorGroups.entries()].map(([vendorId, vendorItems]) => {
        seq += 1;
        const vendorSubtotal   = vendorItems.reduce((s, i) => s + i.price * i.quantity, 0);
        const commissionRate   = rateMap[vendorId] ?? 0;
        const commissionAmount = Math.round(vendorSubtotal * commissionRate) / 100;
        return {
          order:       order._id,
          orderNumber: order.orderNumber,
          subNumber:   `${order.orderNumber}-V${seq}`,
          vendor:      vendorId,
          items:       vendorItems,
          subtotal:    vendorSubtotal,
          commissionRate,
          commissionAmount,
          vendorEarning: Math.round((vendorSubtotal - commissionAmount) * 100) / 100,
          timeline:    [{ status: 'pending', note: 'Order placed' }],
        };
      });
      await SubOrder.create(subOrders);
      await Promise.all(subOrders.map(s =>
        Vendor.findByIdAndUpdate(s.vendor, { $inc: { totalSales: s.subtotal } })
      ));
    }

    await Customer.findByIdAndUpdate(customerId, {
      $inc: { orderCount: 1, totalSpent: order.total },
      $set: { lastOrderAt: new Date(), type: 'returning' },
    });

    if (appliedCoupon) {
      await Coupon.findByIdAndUpdate(appliedCoupon._id, { $inc: { usageCount: 1 } });
    }

    if (settings?.operational?.autoReduceStock !== false) {
      await Promise.all(orderItems.map(item =>
        Product.findByIdAndUpdate(item.product, { $inc: { stock: -item.quantity, soldCount: item.quantity } })
      ));
    }

    await AdminNotification.create({
      type:    'order',
      title:   'New Order Received',
      message: `Order ${order.orderNumber} placed — ₹${order.total}`,
      link:    `/orders/${order._id}`,
    });

    // Auto-book shipment via Shiprocket if active — runs after response is sent
    autoBookShiprocket(order).catch(err =>
      console.error(`[AutoBook] Shiprocket failed for ${order.orderNumber}:`, err.message, err.response?.data || '')
    );

    // Send order confirmation email — non-blocking
    if (req.customer?.email) {
      emailService.sendOrderConfirmationEmail({
        toEmail: req.customer.email,
        toName:  req.customer.name || 'Customer',
        order,
      }).catch(err =>
        console.error(`[Email] Confirmation failed for ${order.orderNumber}:`, err.message)
      );
    }

    res.status(201).json({ success: true, data: order });
  } catch (err) { next(err); }
};

exports.getMyOrders = async (req, res, next) => {
  try {
    const customerId = req.customer._id;
    const page  = Math.max(1, parseInt(req.query.page)  || 1);
    const limit = Math.min(50,  parseInt(req.query.limit) || 10);
    const skip  = (page - 1) * limit;

    const filter = { customer: customerId };
    if (req.query.status && req.query.status !== 'all') filter.status = req.query.status;

    const [orders, total] = await Promise.all([
      Order.find(filter)
        .populate('items.product', 'name images')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Order.countDocuments(filter),
    ]);

    res.json({ success: true, data: orders, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
  } catch (err) { next(err); }
};

exports.getMyOrder = async (req, res, next) => {
  try {
    const order = await Order.findOne({ _id: req.params.id, customer: req.customer._id })
      .populate('items.product', 'name images sku');
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
    res.json({ success: true, data: order });
  } catch (err) { next(err); }
};

exports.getInvoice = async (req, res, next) => {
  try {
    const order = await Order.findOne({ _id: req.params.id, customer: req.customer._id })
      .populate('items.product', 'name images sku')
      .populate('customer', 'name email phone');
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
    res.json({ success: true, data: order });
  } catch (err) { next(err); }
};

exports.trackOrder = async (req, res, next) => {
  try {
    const order = await Order.findOne({ _id: req.params.id, customer: req.customer._id })
      .select('orderNumber status awbCode courierName courierSlug trackingNumber timeline shippingAddress createdAt');
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

    const response = {
      orderNumber:    order.orderNumber,
      status:         order.status,
      awbCode:        order.awbCode,
      courierName:    order.courierName,
      trackingNumber: order.trackingNumber,
      timeline:       order.timeline,
      placedAt:       order.createdAt,
      liveTracking:   null,
    };

    if (order.awbCode && order.courierSlug === 'shiprocket') {
      try {
        response.liveTracking = await shiprocket.trackShipment(order.awbCode);
      } catch (_) {
        // live tracking is best-effort; don't fail the response
      }
    }

    res.json({ success: true, data: response });
  } catch (err) { next(err); }
};

exports.cancelOrder = async (req, res, next) => {
  try {
    const order = await Order.findOne({ _id: req.params.id, customer: req.customer._id });
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
    if (!['pending', 'processing'].includes(order.status)) {
      return res.status(400).json({ success: false, message: 'Order cannot be cancelled at this stage' });
    }

    order.status = 'cancelled';
    order.timeline.push({ status: 'cancelled', note: 'Cancelled by customer', createdAt: new Date() });
    await order.save();

    // Cascade the cancellation to every vendor sub-order still in flight
    await SubOrder.updateMany(
      { order: order._id, status: { $in: ['pending', 'processing'] } },
      {
        $set:  { status: 'cancelled' },
        $push: { timeline: { status: 'cancelled', note: 'Parent order cancelled by customer' } },
      },
    );

    // Restore stock
    const settings = await StoreSettings.findOne({ storeId: 'default' }).lean();
    if (settings?.operational?.autoReduceStock !== false) {
      await Promise.all(order.items.map(item =>
        Product.findByIdAndUpdate(item.product, { $inc: { stock: item.quantity, soldCount: -item.quantity } })
      ));
    }

    // Cancel Shiprocket shipment if AWB was assigned
    if (order.awbCode && order.courierSlug === 'shiprocket') {
      shiprocket.cancelShipment(order.awbCode).catch(err =>
        console.error(`[Cancel] Shiprocket cancellation failed for ${order.orderNumber}:`, err.message, err.response?.data || '')
      );
    }

    res.json({ success: true, data: order });
  } catch (err) { next(err); }
};
