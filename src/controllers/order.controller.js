const { getOrderModel }             = require('../models/Order');
const { getSubOrderModel }          = require('../models/SubOrder');
const { getCustomerModel }          = require('../models/Customer');
const { getProductModel }           = require('../models/Product');
const { getVendorModel }            = require('../models/Vendor');
const { getAdminNotificationModel } = require('../models/AdminNotification');
const { getStoreSettingsModel }     = require('../models/StoreSettings');
const invoiceService                = require('../services/invoice.service');
const { creditWallet }               = require('../utils/wallet');

const generateOrderNumber = () => `ORD-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

exports.list = async (req, res, next) => {
  try {
    const Order  = getOrderModel(req.tenantConn);
    const page   = Math.max(1, parseInt(req.query.page)  || 1);
    const limit  = Math.min(100, parseInt(req.query.limit) || 20);
    const skip   = (page - 1) * limit;
    const filter = {};

    if (req.query.status && req.query.status !== 'all') {
      if (req.query.status === 'delivered') {
        filter.status = { $in: ['delivered', 'shipped'] };
      } else {
        filter.status = req.query.status;
      }
    }
    if (req.query.platform)   filter.platform = req.query.platform;
    if (req.query.search) {
      const s = req.query.search;
      filter.$or = [
        { orderNumber: { $regex: s, $options: 'i' } },
      ];
    }
    if (req.query.startDate) filter.createdAt = { $gte: new Date(req.query.startDate) };
    if (req.query.endDate)   filter.createdAt = { ...filter.createdAt, $lte: new Date(req.query.endDate) };

    const [orders, total] = await Promise.all([
      Order.find(filter)
        .populate('customer', 'name email phone')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Order.countDocuments(filter),
    ]);

    res.json({ success: true, data: orders, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
  } catch (err) { next(err); }
};

exports.getOne = async (req, res, next) => {
  try {
    const Order    = getOrderModel(req.tenantConn);
    const SubOrder = getSubOrderModel(req.tenantConn);
    const order = await Order.findById(req.params.id)
      .populate('customer', 'name email phone')
      .populate('items.product', 'name images sku');
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

    const subOrders = await SubOrder.find({ order: order._id })
      .populate('vendor', 'storeName slug')
      .lean();

    res.json({ success: true, data: { ...order.toObject(), subOrders } });
  } catch (err) { next(err); }
};

exports.create = async (req, res, next) => {
  try {
    const Order             = getOrderModel(req.tenantConn);
    const Customer          = getCustomerModel(req.tenantConn);
    const Product           = getProductModel(req.tenantConn);
    const AdminNotification = getAdminNotificationModel(req.tenantConn);
    const StoreSettings     = getStoreSettingsModel(req.tenantConn);
    const { customerId, items, platform, shippingAddress, paymentMethod, couponCode } = req.body;

    const productIds = items.map(i => i.product);
    const products   = await Product.find({ _id: { $in: productIds } });
    const productMap = Object.fromEntries(products.map(p => [p._id.toString(), p]));

    let subtotal = 0;
    const orderItems = items.map(item => {
      const p     = productMap[item.product];
      if (!p) throw Object.assign(new Error(`Product ${item.product} not found`), { statusCode: 404 });
      const price = p.discountPrice || p.price;
      subtotal   += price * item.quantity;
      return { product: p._id, name: p.name, sku: p.sku, image: p.images?.[0] || null, quantity: item.quantity, price, attributes: item.attributes || {} };
    });

    const settings = await StoreSettings.findOne({ storeId: 'default' }).lean();
    const tax      = settings?.orders?.taxIncluded ? 0 : Math.round(subtotal * ((settings?.orders?.gstRate || 0) / 100));
    const total    = subtotal + tax;

    const order = await Order.create({
      orderNumber: generateOrderNumber(),
      customer:    customerId,
      items:       orderItems,
      subtotal,
      tax,
      total,
      platform:    platform || 'Web',
      shippingAddress,
      paymentMethod: paymentMethod || 'cod',
      couponCode:  couponCode || null,
      timeline:    [{ status: 'pending', note: 'Order placed' }],
    });

    // Update customer stats
    await Customer.findByIdAndUpdate(customerId, {
      $inc: { orderCount: 1, totalSpent: total },
      $set: { lastOrderAt: new Date(), type: 'returning' },
    });

    // Auto-reduce stock
    if (settings?.operational?.autoReduceStock !== false) {
      await Promise.all(orderItems.map(item =>
        Product.findByIdAndUpdate(item.product, { $inc: { stock: -item.quantity, soldCount: item.quantity } })
      ));
    }

    await AdminNotification.create({
      type:    'order',
      title:   'New Order Received',
      message: `Order ${order.orderNumber} placed — ₹${total}`,
      link:    `/orders/${order._id}`,
    });

    res.status(201).json({ success: true, data: order });
  } catch (err) { next(err); }
};

exports.updateStatus = async (req, res, next) => {
  try {
    const Order = getOrderModel(req.tenantConn);
    const { status, note, trackingNumber, courierName, creditWallet: shouldCreditWallet, walletCreditAmount } = req.body;
    const validStatuses = ['pending', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status' });
    }

    const update = {
      status,
      $push: { timeline: { status, note: note || '', createdAt: new Date() } },
    };
    if (trackingNumber) update.trackingNumber = trackingNumber;
    if (courierName)    update.courierName    = courierName;

    const order = await Order.findByIdAndUpdate(req.params.id, update, { new: true })
      .populate('customer', 'name email');
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

    // Optional: admin marks a refund as a wallet credit instead of (or in
    // addition to) an external refund — the platform has no payment-gateway
    // refund integration, so this is the only in-app way money moves back
    // to a customer. Amount defaults to the order total but the admin can
    // enter a partial amount (e.g. a partial return).
    let walletResult = null;
    if (status === 'refunded' && shouldCreditWallet) {
      const amount = Number(walletCreditAmount) > 0 ? Number(walletCreditAmount) : order.total;
      walletResult = await creditWallet(req.tenantConn, {
        customerId: order.customer._id,
        amount,
        reason: `Refund for order ${order.orderNumber}`,
        orderRef: order._id,
      });
    }

    res.json({ success: true, data: order, wallet: walletResult ? { balance: walletResult.balance } : undefined });
  } catch (err) { next(err); }
};

// PATCH /orders/bulk-status — same atomic fetch-then-updateMany pattern as
// productModeration.controller.js's bulkApprove: fetch the matching set first
// (so we know exactly which orders were eligible), updateMany, then report
// matched/modified counts back to the caller.
exports.bulkUpdateStatus = async (req, res, next) => {
  try {
    const Order = getOrderModel(req.tenantConn);
    const ids = Array.isArray(req.body?.ids) ? req.body.ids : [];
    const { status, note } = req.body;
    const validStatuses = ['pending', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded'];

    if (!ids.length) return res.status(400).json({ success: false, message: 'No orders selected' });
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status' });
    }

    const targets = await Order.find({ _id: { $in: ids } }).select('_id').lean();

    const result = await Order.updateMany(
      { _id: { $in: targets.map(t => t._id) } },
      {
        $set: { status },
        $push: { timeline: { status, note: note || '', createdAt: new Date() } },
      },
    );

    res.json({
      success: true,
      data: { matchedCount: result.matchedCount, modifiedCount: result.modifiedCount },
      message: `${result.modifiedCount} of ${ids.length} order(s) updated`,
    });
  } catch (err) { next(err); }
};

exports.exportCSV = async (req, res, next) => {
  try {
    const Order  = getOrderModel(req.tenantConn);
    const filter = {};
    if (req.query.status)   filter.status   = req.query.status;
    if (req.query.platform) filter.platform = req.query.platform;

    const orders = await Order.find(filter).populate('customer', 'name email').lean();
    const headers = 'Order Number,Customer,Email,Items,Amount,Platform,Status,Date\n';
    const rows    = orders.map(o =>
      `${o.orderNumber},"${o.customer?.name || 'Guest'}","${o.customer?.email || ''}",${o.items?.length || 0},${o.total},${o.platform},${o.status},"${new Date(o.createdAt).toLocaleDateString()}"`
    ).join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="orders.csv"');
    res.send(headers + rows);
  } catch (err) { next(err); }
};

// GET /orders/:id/invoice — ?format=pdf&subOrderId=... streams a downloadable
// PDF (the whole order, or a single vendor's slice for GST-correct
// per-seller invoices on a marketplace order). Without ?format=pdf, returns
// the raw JSON as before.
exports.printInvoice = async (req, res, next) => {
  try {
    const Order = getOrderModel(req.tenantConn);
    const order = await Order.findById(req.params.id)
      .populate('customer', 'name email phone')
      .populate('items.product', 'name images');
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

    if (req.query.format !== 'pdf') {
      return res.json({ success: true, data: order });
    }

    const StoreSettings = getStoreSettingsModel(req.tenantConn);
    const storeSettings = await StoreSettings.findOne({ storeId: 'default' }).select('general orders').lean();

    let scope = order;
    let seller = { storeName: storeSettings?.general?.storeName, gstEnabled: true };

    if (req.query.subOrderId) {
      const SubOrder = getSubOrderModel(req.tenantConn);
      const Vendor   = getVendorModel(req.tenantConn);
      const subOrder = await SubOrder.findOne({ _id: req.query.subOrderId, order: order._id }).lean();
      if (!subOrder) return res.status(404).json({ success: false, message: 'Sub-order not found' });
      const vendor = await Vendor.findById(subOrder.vendor)
        .select('storeName gstin gstEnabled pickupAddress').lean();
      scope = subOrder;
      seller = vendor;
    }

    const docDefinition = invoiceService.buildInvoiceDocDefinition({
      order, scope, seller, customer: order.customer, storeSettings,
    });
    const pdfBuffer = await invoiceService.renderPdfBuffer(docDefinition);

    const filenameBase = scope.subNumber || order.invoiceNumber || order.orderNumber;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filenameBase}.pdf"`);
    res.send(pdfBuffer);
  } catch (err) { next(err); }
};
