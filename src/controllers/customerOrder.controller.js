const { getOrderModel }             = require('../models/Order');
const { getSubOrderModel }          = require('../models/SubOrder');
const { getVendorModel }            = require('../models/Vendor');
const { getProductModel }           = require('../models/Product');
const { getCustomerModel }          = require('../models/Customer');
const { getCouponModel }            = require('../models/Coupon');
const { getAdminNotificationModel } = require('../models/AdminNotification');
const { getStoreSettingsModel }     = require('../models/StoreSettings');
const { getCourierModel }           = require('../models/Courier');
const { getCounterModel, nextValue } = require('../models/Counter');
const shiprocket        = require('../services/shiprocket.service');
const pricing           = require('../services/pricing.service');
const emailService      = require('../services/email.service');
const invoiceService    = require('../services/invoice.service');
const { rollupOrderStatus } = require('../utils/orderStatusRollup');

// Books a single Shiprocket shipment for a store-owned order (no vendor
// split — the store itself fulfills these, so the fixed 'Primary' pickup
// location is correct here, unlike the per-vendor path below).
async function autoBookShiprocket(order, { Courier, Customer, Order }) {
  const courier = await Courier.findOne({ slug: 'shiprocket', isActive: true });
  if (!courier) return;

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

  if (awbCode && customer?.email) {
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

// Books an independent Shiprocket shipment for ONE vendor's slice of a
// (possibly multi-vendor) order. A vendor without a registered Shiprocket
// pickup location is BLOCKED, not soft-defaulted to a shared address — the
// SubOrder stays pending with a timeline note and an AdminNotification is
// raised so the admin can register the vendor's pickup location.
async function autoBookShiprocketForSubOrder(subOrder, order, { Courier, Customer, SubOrder, Vendor, AdminNotification, Order }) {
  const courier = await Courier.findOne({ slug: 'shiprocket', isActive: true });
  if (!courier) return;

  const customer = await Customer.findById(order.customer).select('name email phone').lean();
  const vendor    = await Vendor.findById(subOrder.vendor).select('storeName pickupAddress shiprocketPickupLocation').lean();

  if (!vendor?.shiprocketPickupLocation) {
    await SubOrder.findByIdAndUpdate(subOrder._id, {
      $push: { timeline: { status: subOrder.status, note: 'Shipment blocked: vendor has no registered pickup location. Contact admin.' } },
    });
    await AdminNotification.create({
      type:    'shipping_blocked',
      title:   'Shipment blocked — missing pickup location',
      message: `${vendor?.storeName || 'A vendor'} has no registered Shiprocket pickup location; sub-order ${subOrder.subNumber} could not be booked.`,
      link:    `/vendors/${subOrder.vendor}`,
    });
    return;
  }

  // Build a Shiprocket-shaped "order" from just this vendor's items, so
  // Shiprocket sees a distinct order per vendor rather than the whole cart.
  const subOrderForShiprocket = {
    orderNumber:     subOrder.subNumber,
    createdAt:       order.createdAt,
    shippingAddress: order.shippingAddress,
    paymentMethod:   order.paymentMethod,
    subtotal:        subOrder.subtotal,
    items:           subOrder.items,
    customer,
  };

  let created = await shiprocket.createOrder(subOrderForShiprocket, vendor.shiprocketPickupLocation);
  if (!created.shipment_id && created.data?.data?.[0]?.pickup_location) {
    created = await shiprocket.createOrder(subOrderForShiprocket, created.data.data[0].pickup_location);
  }
  if (!created.shipment_id) {
    throw new Error(`Shiprocket createOrder failed for ${subOrder.subNumber}: ${created.message || JSON.stringify(created)}`);
  }

  const shipmentId = String(created.shipment_id);
  const awbResp     = await shiprocket.assignAWB({ shipment_id: shipmentId });
  const awbCode     = awbResp?.response?.data?.awb_code || awbResp?.awb_code;

  await SubOrder.findByIdAndUpdate(subOrder._id, {
    awbCode, shipmentId,
    courierSlug: 'shiprocket', courierName: 'Shiprocket',
    trackingNumber: awbCode,
    status: 'processing',
    $push: { timeline: { status: 'processing', note: `Shipment auto-booked via Shiprocket. AWB: ${awbCode}` } },
  });
  await rollupOrderStatus(Order, SubOrder, subOrder.order);

  if (awbCode && customer?.email) {
    await emailService.sendTrackingEmail({
      toEmail: customer.email, toName: customer.name || 'Customer',
      order: { orderNumber: subOrder.subNumber, awbCode, trackingNumber: awbCode, courierName: 'Shiprocket' },
    });
  }
}

const generateOrderNumber = () => `ORD-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

exports.createOrder = async (req, res, next) => {
  try {
    const Order             = getOrderModel(req.tenantConn);
    const SubOrder          = getSubOrderModel(req.tenantConn);
    const Vendor            = getVendorModel(req.tenantConn);
    const Product           = getProductModel(req.tenantConn);
    const Customer          = getCustomerModel(req.tenantConn);
    const Coupon            = getCouponModel(req.tenantConn);
    const AdminNotification = getAdminNotificationModel(req.tenantConn);
    const StoreSettings     = getStoreSettingsModel(req.tenantConn);
    const Courier           = getCourierModel(req.tenantConn);

    const customerId = req.customer._id;
    const { items, shippingAddress, paymentMethod, couponCode, platform } = req.body;

    if (!items?.length) {
      return res.status(400).json({ success: false, message: 'Order must have at least one item' });
    }
    if (!shippingAddress || !shippingAddress.pincode) {
      return res.status(400).json({ success: false, message: 'Shipping address with pincode is required' });
    }

    const productIds = items.map(i => i.product);
    // Also fetch any bundle "companion" products the client claims to have selected,
    // so bundle savings can be validated against the seller's actual configuration.
    const companionIds = items.filter(i => i.bundleOffer?.selected).map(i => i.bundleOffer.withProduct).filter(Boolean);
    const products   = await Product.find({ _id: { $in: [...new Set([...productIds, ...companionIds])] } });
    const productMap = Object.fromEntries(products.map(p => [p._id.toString(), p]));

    const settings    = await StoreSettings.findOne({ storeId: 'default' }).lean();
    const storeGstRate = settings?.orders?.gstRate || 0;
    const taxIncluded  = !!settings?.orders?.taxIncluded;

    let subtotal = 0;
    let tax = 0;
    let giftWrapTotal = 0;
    let bundleSavings = 0;
    const orderItems = items.map(item => {
      const p = productMap[item.product];
      if (!p) throw Object.assign(new Error(`Product ${item.product} not found`), { statusCode: 404 });
      if (p.stock < item.quantity) throw Object.assign(new Error(`Insufficient stock for ${p.name}`), { statusCode: 400 });
      const price = p.discountPrice || p.price;
      const lineSubtotal = price * item.quantity;
      subtotal += lineSubtotal;

      const { rate: gstRate, amount: gstAmount } = pricing.computeLineGst({
        product: p, lineSubtotal, storeGstRate, taxIncluded,
      });
      tax += gstAmount;

      const giftWrap = pricing.computeGiftWrap({ product: p, selected: !!item.giftWrap?.selected, quantity: item.quantity });
      giftWrapTotal += giftWrap.total;

      const companion = item.bundleOffer?.selected ? productMap[item.bundleOffer.withProduct] : null;
      const bundle = pricing.computeBundleOffer({
        product: p,
        companionProduct: companion,
        selected: !!item.bundleOffer?.selected && p.bundleOffer?.withProduct?.toString() === item.bundleOffer?.withProduct,
      });
      bundleSavings += bundle.savings;

      return {
        product:    p._id,
        name:       p.name,
        sku:        p.sku,
        image:      p.images?.[0] || null,
        quantity:   item.quantity,
        price,
        attributes: item.attributes || {},
        gstRate,
        gstAmount,
        giftWrap: { selected: giftWrap.selected, price: giftWrap.price },
        bundleOffer: bundle.selected
          ? { selected: true, withProduct: item.bundleOffer.withProduct, bundlePrice: bundle.bundlePrice }
          : { selected: false, withProduct: null, bundlePrice: null },
      };
    });
    tax = Math.round(tax * 100) / 100;

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

    // ── Marketplace split: one sub-order per vendor ──────────────────────────
    // Store-owned items (product.vendor = null) stay on the parent order only.
    const vendorGroups = new Map();
    const storeOwnedItems = [];
    for (const item of orderItems) {
      const vendorId = productMap[item.product.toString()]?.vendor?.toString();
      if (!vendorId) { storeOwnedItems.push(item); continue; }
      if (!vendorGroups.has(vendorId)) vendorGroups.set(vendorId, []);
      vendorGroups.get(vendorId).push(item);
    }

    const vendors  = vendorGroups.size
      ? await Vendor.find({ _id: { $in: [...vendorGroups.keys()] } })
          .select('commissionRate storeName shippingSettings').lean()
      : [];
    const vendorMap = Object.fromEntries(vendors.map(v => [v._id.toString(), v]));

    // Shipping is always recomputed server-side — the client-quoted value
    // from /calculate-rate is display-only and never trusted. Each vendor's
    // slice is priced independently against that vendor's own shipping
    // settings (falling back to the global zone table); store-owned items
    // are priced once against the global table.
    const groupEntries = [...vendorGroups.entries()];
    const vendorShippingResults = await Promise.all(groupEntries.map(([vendorId, vendorItems]) => {
      const vendorSubtotal = vendorItems.reduce((s, i) => s + i.price * i.quantity, 0);
      return pricing.computeVendorShipping({
        vendor: vendorMap[vendorId],
        pincode: shippingAddress.pincode,
        merchandiseTotal: vendorSubtotal,
      });
    }));
    const storeOwnedSubtotal = storeOwnedItems.reduce((s, i) => s + i.price * i.quantity, 0);
    const { rate: storeShippingCost } = storeOwnedItems.length || !groupEntries.length
      ? await pricing.computeShipping({ pincode: shippingAddress.pincode, merchandiseTotal: storeOwnedSubtotal })
      : { rate: 0 };

    const shippingCost = Math.round(
      (storeShippingCost + vendorShippingResults.reduce((s, r) => s + r.rate, 0)) * 100
    ) / 100;

    const total = Math.max(0, subtotal + tax + shippingCost + giftWrapTotal - couponDiscount);

    const Counter = getCounterModel(req.tenantConn);
    const invoiceSeq = await nextValue(Counter, 'invoiceNumber', settings?.orders?.invoiceStartNumber || 1001);
    const invoiceNumber = `${settings?.orders?.invoicePrefix || 'INV-'}${invoiceSeq}`;

    const order = await Order.create({
      orderNumber:    generateOrderNumber(),
      invoiceNumber,
      customer:       customerId,
      items:          orderItems,
      subtotal,
      tax,
      shippingCost,
      discount:       couponDiscount,
      giftWrapTotal,
      bundleSavings,
      total,
      platform:       String(platform || '').toLowerCase() === 'app' ? 'App' : 'Web',
      shippingAddress,
      paymentMethod:  paymentMethod || 'cod',
      couponCode:     couponCode || null,
      timeline:       [{ status: 'pending', note: 'Order placed' }],
    });

    let createdSubOrders = [];
    if (vendorGroups.size) {
      const rateMap  = Object.fromEntries(vendors.map(v => [v._id.toString(), v.commissionRate || 0]));

      let seq = 0;
      const subOrders = groupEntries.map(([vendorId, vendorItems], idx) => {
        seq += 1;
        const vendorSubtotal   = vendorItems.reduce((s, i) => s + i.price * i.quantity, 0);
        const vendorTax        = Math.round(vendorItems.reduce((s, i) => s + i.gstAmount, 0) * 100) / 100;
        const vendorGiftWrap   = vendorItems.reduce((s, i) => s + (i.giftWrap?.selected ? i.giftWrap.price * i.quantity : 0), 0);
        const commissionRate   = rateMap[vendorId] ?? 0;
        const commissionAmount = Math.round(vendorSubtotal * commissionRate) / 100;
        return {
          order:       order._id,
          orderNumber: order.orderNumber,
          subNumber:   `${order.orderNumber}-V${seq}`,
          vendor:      vendorId,
          items:       vendorItems,
          subtotal:    vendorSubtotal,
          shippingCost: Math.round(vendorShippingResults[idx].rate * 100) / 100,
          tax:         vendorTax,
          giftWrapTotal: vendorGiftWrap,
          commissionRate,
          commissionAmount,
          vendorEarning: Math.round((vendorSubtotal - commissionAmount) * 100) / 100,
          timeline:    [{ status: 'pending', note: 'Order placed' }],
        };
      });
      createdSubOrders = await SubOrder.create(subOrders);
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

    // Auto-book shipment(s) via Shiprocket if active — runs after response is
    // sent. Orders with a vendor split get one independent booking per
    // vendor's SubOrder; pure store-owned orders keep booking against the
    // whole Order as before.
    if (createdSubOrders.length) {
      createdSubOrders.forEach(so =>
        autoBookShiprocketForSubOrder(so, order, { Courier, Customer, SubOrder, Vendor, AdminNotification, Order }).catch(err =>
          console.error(`[AutoBook] Shiprocket failed for suborder ${so.subNumber}:`, err.message, err.response?.data || '')
        )
      );
    } else {
      autoBookShiprocket(order, { Courier, Customer, Order }).catch(err =>
        console.error(`[AutoBook] Shiprocket failed for ${order.orderNumber}:`, err.message, err.response?.data || '')
      );
    }

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
    const Order = getOrderModel(req.tenantConn);
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
    const Order = getOrderModel(req.tenantConn);
    const order = await Order.findOne({ _id: req.params.id, customer: req.customer._id })
      .populate('items.product', 'name images sku');
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
    res.json({ success: true, data: order });
  } catch (err) { next(err); }
};

// GET /customer/orders/:id/invoice — ?format=pdf streams a downloadable PDF,
// otherwise returns the raw order JSON (unchanged, for any existing consumer
// that renders its own invoice view).
exports.getInvoice = async (req, res, next) => {
  try {
    const Order = getOrderModel(req.tenantConn);
    const order = await Order.findOne({ _id: req.params.id, customer: req.customer._id })
      .populate('items.product', 'name images sku')
      .populate('customer', 'name email phone');
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

    if (req.query.format !== 'pdf') {
      return res.json({ success: true, data: order });
    }

    const StoreSettings = getStoreSettingsModel(req.tenantConn);
    const storeSettings = await StoreSettings.findOne({ storeId: 'default' }).select('general orders').lean();

    const docDefinition = invoiceService.buildInvoiceDocDefinition({
      order,
      scope: order,
      seller: { storeName: storeSettings?.general?.storeName, gstEnabled: true },
      customer: order.customer,
      storeSettings,
    });
    const pdfBuffer = await invoiceService.renderPdfBuffer(docDefinition);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${order.invoiceNumber || order.orderNumber}.pdf"`);
    res.send(pdfBuffer);
  } catch (err) { next(err); }
};

exports.trackOrder = async (req, res, next) => {
  try {
    const Order    = getOrderModel(req.tenantConn);
    const SubOrder = getSubOrderModel(req.tenantConn);
    const order = await Order.findOne({ _id: req.params.id, customer: req.customer._id })
      .select('orderNumber status awbCode courierName courierSlug trackingNumber timeline shippingAddress createdAt');
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

    const subOrders = await SubOrder.find({ order: order._id })
      .populate('vendor', 'storeName')
      .select('subNumber vendor status awbCode courierName courierSlug trackingNumber timeline')
      .lean();

    // Multi-vendor orders: each vendor's parcel has its own real AWB, so
    // surface them individually rather than one (potentially absent or
    // misleading) Order-level tracking number.
    const shipments = await Promise.all(subOrders.map(async (so) => {
      let liveTracking = null;
      if (so.awbCode && so.courierSlug === 'shiprocket') {
        liveTracking = await shiprocket.trackShipment(so.awbCode).catch(() => null);
      }
      return {
        vendorName:     so.vendor?.storeName || null,
        subNumber:      so.subNumber,
        status:         so.status,
        awbCode:        so.awbCode,
        courierName:    so.courierName,
        trackingNumber: so.trackingNumber,
        timeline:       so.timeline,
        liveTracking,
      };
    }));

    const response = {
      orderNumber: order.orderNumber,
      status:      order.status,
      timeline:    order.timeline,
      placedAt:    order.createdAt,
      shipments,
      // Legacy single-shipment fields — only meaningful for store-owned
      // orders (no vendor split); left as-is for backward compatibility.
      awbCode:        subOrders.length ? null : order.awbCode,
      courierName:    subOrders.length ? null : order.courierName,
      trackingNumber: subOrders.length ? null : order.trackingNumber,
      liveTracking:   null,
    };

    if (!subOrders.length && order.awbCode && order.courierSlug === 'shiprocket') {
      response.liveTracking = await shiprocket.trackShipment(order.awbCode).catch(() => null);
    }

    res.json({ success: true, data: response });
  } catch (err) { next(err); }
};

exports.cancelOrder = async (req, res, next) => {
  try {
    const Order         = getOrderModel(req.tenantConn);
    const SubOrder      = getSubOrderModel(req.tenantConn);
    const Product       = getProductModel(req.tenantConn);
    const StoreSettings = getStoreSettingsModel(req.tenantConn);

    const order = await Order.findOne({ _id: req.params.id, customer: req.customer._id });
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
    if (!['pending', 'processing'].includes(order.status)) {
      return res.status(400).json({ success: false, message: 'Order cannot be cancelled at this stage' });
    }

    order.status = 'cancelled';
    order.timeline.push({ status: 'cancelled', note: 'Cancelled by customer', createdAt: new Date() });
    await order.save();

    // Cascade the cancellation to every vendor sub-order still in flight
    const inFlightSubOrders = await SubOrder.find(
      { order: order._id, status: { $in: ['pending', 'processing'] } },
    ).select('awbCode courierSlug').lean();
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

    // Cancel each vendor's own Shiprocket shipment (per-vendor bookings each
    // carry their own AWB now, distinct from the legacy Order-level one).
    inFlightSubOrders.forEach(so => {
      if (so.awbCode && so.courierSlug === 'shiprocket') {
        shiprocket.cancelShipment(so.awbCode).catch(err =>
          console.error(`[Cancel] Shiprocket cancellation failed for suborder AWB ${so.awbCode}:`, err.message, err.response?.data || '')
        );
      }
    });

    // Cancel the legacy Order-level shipment too (store-owned orders)
    if (order.awbCode && order.courierSlug === 'shiprocket') {
      shiprocket.cancelShipment(order.awbCode).catch(err =>
        console.error(`[Cancel] Shiprocket cancellation failed for ${order.orderNumber}:`, err.message, err.response?.data || '')
      );
    }

    res.json({ success: true, data: order });
  } catch (err) { next(err); }
};
