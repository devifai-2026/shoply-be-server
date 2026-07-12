const Order             = require('../models/Order');
const SubOrder          = require('../models/SubOrder');
const Customer          = require('../models/Customer');
const Product           = require('../models/Product');
const AdminNotification = require('../models/AdminNotification');
const StoreSettings     = require('../models/StoreSettings');

const generateOrderNumber = () => `ORD-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

exports.list = async (req, res, next) => {
  try {
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
    const { status, note, trackingNumber, courierName } = req.body;
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

    res.json({ success: true, data: order });
  } catch (err) { next(err); }
};

exports.exportCSV = async (req, res, next) => {
  try {
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

exports.printInvoice = async (req, res, next) => {
  try {
    const order = await Order.findById(req.params.id)
      .populate('customer', 'name email phone')
      .populate('items.product', 'name images');
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
    res.json({ success: true, data: order });
  } catch (err) { next(err); }
};
