const { getOrderModel }    = require('../models/Order');
const { getCustomerModel } = require('../models/Customer');
const { getProductModel }  = require('../models/Product');
const { getCartModel }     = require('../models/Cart');

const ABANDONED_AFTER_MS = 2 * 60 * 60 * 1000; // matches abandonedCartJob.js

exports.getStats = async (req, res, next) => {
  try {
    const Order    = getOrderModel(req.tenantConn);
    const Customer = getCustomerModel(req.tenantConn);
    const Product  = getProductModel(req.tenantConn);
    const Cart     = getCartModel(req.tenantConn);
    const now        = new Date();
    const startMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const [
      totalRevenue,
      totalOrders,
      todayOrders,
      totalCustomers,
      abandonedCarts,
      lowStockCount,
    ] = await Promise.all([
      Order.aggregate([
        { $match: { status: { $in: ['delivered', 'shipped', 'processing'] } } },
        { $group: { _id: null, total: { $sum: '$total' } } },
      ]),
      Order.countDocuments(),
      Order.countDocuments({ createdAt: { $gte: startToday } }),
      Customer.countDocuments({ status: 'active' }),
      // Real cart abandonment — a non-empty cart with no activity in the
      // last 2 hours — rather than a proxy count of stalled Order documents
      // (a customer who never reached checkout was invisible to that count).
      Cart.countDocuments({
        'items.0': { $exists: true },
        lastActivityAt: { $lte: new Date(Date.now() - ABANDONED_AFTER_MS) },
      }),
      Product.countDocuments({ $expr: { $lte: ['$stock', '$alertLevel'] } }),
    ]);

    res.json({
      success: true,
      data: {
        totalRevenue:   totalRevenue[0]?.total || 0,
        totalOrders,
        todayOrders,
        totalCustomers,
        abandonedCarts,
        lowStockCount,
      },
    });
  } catch (err) { next(err); }
};

exports.listAbandonedCarts = async (req, res, next) => {
  try {
    const Cart = getCartModel(req.tenantConn);
    const carts = await Cart.find({
      'items.0': { $exists: true },
      lastActivityAt: { $lte: new Date(Date.now() - ABANDONED_AFTER_MS) },
    })
      .sort({ lastActivityAt: -1 })
      .limit(100)
      .populate('customer', 'name email')
      .populate('items.product', 'name price discountPrice')
      .lean();

    const data = carts.map(c => ({
      _id: c._id,
      customer: c.customer,
      itemCount: (c.items || []).length,
      value: (c.items || []).reduce((sum, i) => {
        const price = i.product?.discountPrice || i.product?.price || 0;
        return sum + price * i.quantity;
      }, 0),
      lastActivityAt: c.lastActivityAt,
      reminderSentAt: c.reminderSentAt,
    }));

    res.json({ success: true, data });
  } catch (err) { next(err); }
};

exports.getRecentOrders = async (req, res, next) => {
  try {
    const Order  = getOrderModel(req.tenantConn);
    const limit  = parseInt(req.query.limit) || 10;
    const orders = await Order.find()
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate('customer', 'name email');
    res.json({ success: true, data: orders });
  } catch (err) { next(err); }
};

exports.getPlatformSplit = async (req, res, next) => {
  try {
    const Order  = getOrderModel(req.tenantConn);
    const result = await Order.aggregate([
      { $group: { _id: '$platform', count: { $sum: 1 }, revenue: { $sum: '$total' } } },
    ]);
    const total = result.reduce((s, r) => s + r.count, 0) || 1;
    const data  = result.map(r => ({
      platform:   r._id,
      count:      r.count,
      revenue:    r.revenue,
      percentage: Math.round((r.count / total) * 100),
    }));
    res.json({ success: true, data });
  } catch (err) { next(err); }
};
