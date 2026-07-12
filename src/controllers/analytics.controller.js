const Order   = require('../models/Order');
const Product = require('../models/Product');

const getDateRange = (period = '30d') => {
  const end   = new Date();
  const start = new Date();
  const map   = { '7d': 7, '30d': 30, '90d': 90, '1y': 365 };
  start.setDate(start.getDate() - (map[period] || 30));
  return { start, end };
};

exports.getSummary = async (req, res, next) => {
  try {
    const { start, end } = getDateRange(req.query.period);
    const prev           = new Date(start);
    prev.setDate(prev.getDate() - (end - start) / 86400000);

    const [curr, previous] = await Promise.all([
      Order.aggregate([
        { $match: { createdAt: { $gte: start, $lte: end }, status: { $nin: ['cancelled', 'refunded'] } } },
        { $group: { _id: null, revenue: { $sum: '$total' }, orders: { $sum: 1 }, aov: { $avg: '$total' } } },
      ]),
      Order.aggregate([
        { $match: { createdAt: { $gte: prev, $lt: start }, status: { $nin: ['cancelled', 'refunded'] } } },
        { $group: { _id: null, revenue: { $sum: '$total' }, orders: { $sum: 1 } } },
      ]),
    ]);

    const c = curr[0]     || { revenue: 0, orders: 0, aov: 0 };
    const p = previous[0] || { revenue: 0, orders: 0 };
    const pct = (a, b) => b === 0 ? 0 : Math.round(((a - b) / b) * 100);

    res.json({
      success: true,
      data: {
        revenue:    { value: c.revenue,    change: pct(c.revenue, p.revenue) },
        orders:     { value: c.orders,     change: pct(c.orders, p.orders) },
        aov:        { value: Math.round(c.aov || 0) },
        period:     req.query.period || '30d',
      },
    });
  } catch (err) { next(err); }
};

exports.getTopProducts = async (req, res, next) => {
  try {
    const { start, end } = getDateRange(req.query.period);
    const limit          = parseInt(req.query.limit) || 10;

    const result = await Order.aggregate([
      { $match: { createdAt: { $gte: start, $lte: end }, status: { $nin: ['cancelled', 'refunded'] } } },
      { $unwind: '$items' },
      { $group: { _id: '$items.product', name: { $first: '$items.name' }, sku: { $first: '$items.sku' }, sold: { $sum: '$items.quantity' }, revenue: { $sum: { $multiply: ['$items.price', '$items.quantity'] } } } },
      { $sort: { sold: -1 } },
      { $limit: limit },
    ]);

    res.json({ success: true, data: result });
  } catch (err) { next(err); }
};

exports.getSalesByCategory = async (req, res, next) => {
  try {
    const { start, end } = getDateRange(req.query.period);

    const result = await Order.aggregate([
      { $match: { createdAt: { $gte: start, $lte: end }, status: { $nin: ['cancelled', 'refunded'] } } },
      { $unwind: '$items' },
      { $lookup: { from: 'products', localField: 'items.product', foreignField: '_id', as: 'product' } },
      { $unwind: '$product' },
      { $lookup: { from: 'categories', localField: 'product.category', foreignField: '_id', as: 'category' } },
      { $unwind: '$category' },
      { $group: { _id: '$category._id', name: { $first: '$category.name' }, revenue: { $sum: { $multiply: ['$items.price', '$items.quantity'] } }, orders: { $sum: 1 } } },
      { $sort: { revenue: -1 } },
    ]);

    const total = result.reduce((s, r) => s + r.revenue, 0) || 1;
    const data  = result.map(r => ({ ...r, percentage: Math.round((r.revenue / total) * 100) }));

    res.json({ success: true, data });
  } catch (err) { next(err); }
};

exports.exportReport = async (req, res, next) => {
  try {
    const { start, end } = getDateRange(req.query.period);
    const orders = await Order.find({ createdAt: { $gte: start, $lte: end } })
      .populate('customer', 'name email')
      .lean();

    const headers = 'Order Number,Customer,Total,Status,Platform,Date\n';
    const rows    = orders.map(o =>
      `${o.orderNumber},"${o.customer?.name || 'Guest'}",${o.total},${o.status},${o.platform},"${new Date(o.createdAt).toLocaleDateString()}"`
    ).join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="analytics-report.csv"');
    res.send(headers + rows);
  } catch (err) { next(err); }
};
