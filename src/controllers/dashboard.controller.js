const Order    = require('../models/Order');
const Customer = require('../models/Customer');
const Product  = require('../models/Product');

exports.getStats = async (req, res, next) => {
  try {
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
      Order.countDocuments({ status: 'pending', createdAt: { $lt: new Date(Date.now() - 3600000) } }),
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

exports.getRecentOrders = async (req, res, next) => {
  try {
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
