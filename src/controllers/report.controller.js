const Order    = require('../models/Order');
const Customer = require('../models/Customer');
const Product  = require('../models/Product');

const dateRange = (period = '30d') => {
  const end   = new Date();
  const start = new Date();
  const days  = { '7d': 7, '30d': 30, '90d': 90, '1y': 365 };
  start.setDate(start.getDate() - (days[period] || 30));
  return { start, end };
};

exports.getSummary = async (req, res, next) => {
  try {
    const { start, end } = dateRange(req.query.period);
    const filter         = { createdAt: { $gte: start, $lte: end } };

    const [revenue, orders, customers, aov] = await Promise.all([
      Order.aggregate([{ $match: { ...filter, status: { $nin: ['cancelled', 'refunded'] } } }, { $group: { _id: null, total: { $sum: '$total' } } }]),
      Order.countDocuments(filter),
      Customer.countDocuments({ createdAt: { $gte: start, $lte: end } }),
      Order.aggregate([{ $match: { ...filter, status: { $nin: ['cancelled', 'refunded'] } } }, { $group: { _id: null, avg: { $avg: '$total' } } }]),
    ]);

    res.json({
      success: true,
      data: {
        revenue:      revenue[0]?.total || 0,
        orders,
        newCustomers: customers,
        aov:          Math.round(aov[0]?.avg || 0),
        period:       req.query.period || '30d',
      },
    });
  } catch (err) { next(err); }
};

exports.getSalesByChannel = async (req, res, next) => {
  try {
    const { start, end } = dateRange(req.query.period);
    const result = await Order.aggregate([
      { $match: { createdAt: { $gte: start, $lte: end }, status: { $nin: ['cancelled', 'refunded'] } } },
      { $group: { _id: '$platform', revenue: { $sum: '$total' }, count: { $sum: 1 } } },
    ]);
    const total = result.reduce((s, r) => s + r.revenue, 0) || 1;
    const data  = result.map(r => ({ channel: r._id, revenue: r.revenue, orders: r.count, percentage: Math.round((r.revenue / total) * 100) }));
    res.json({ success: true, data });
  } catch (err) { next(err); }
};

exports.getOrderStatus = async (req, res, next) => {
  try {
    const { start, end } = dateRange(req.query.period);
    const result = await Order.aggregate([
      { $match: { createdAt: { $gte: start, $lte: end } } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]);
    const data = Object.fromEntries(result.map(r => [r._id, r.count]));
    res.json({ success: true, data });
  } catch (err) { next(err); }
};

exports.getInventoryAlerts = async (req, res, next) => {
  try {
    const [outOfStock, lowStock, healthyStock] = await Promise.all([
      Product.countDocuments({ stock: 0 }),
      Product.countDocuments({ $expr: { $and: [{ $gt: ['$stock', 0] }, { $lte: ['$stock', '$alertLevel'] }] } }),
      Product.countDocuments({ $expr: { $gt: ['$stock', '$alertLevel'] } }),
    ]);
    res.json({ success: true, data: { outOfStock, lowStock, healthyStock } });
  } catch (err) { next(err); }
};

exports.getTopProducts = async (req, res, next) => {
  try {
    const { start, end } = dateRange(req.query.period);
    const limit          = parseInt(req.query.limit) || 10;
    const result = await Order.aggregate([
      { $match: { createdAt: { $gte: start, $lte: end }, status: { $nin: ['cancelled', 'refunded'] } } },
      { $unwind: '$items' },
      { $group: { _id: '$items.product', name: { $first: '$items.name' }, sku: { $first: '$items.sku' }, sales: { $sum: '$items.quantity' }, revenue: { $sum: { $multiply: ['$items.price', '$items.quantity'] } } } },
      { $sort: { revenue: -1 } },
      { $limit: limit },
    ]);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
};

exports.getTopCustomers = async (req, res, next) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    const customers = await Customer.find({ status: 'active' })
      .sort({ totalSpent: -1 })
      .limit(limit)
      .select('name email orderCount totalSpent platform');
    res.json({ success: true, data: customers });
  } catch (err) { next(err); }
};

exports.exportCSV = async (req, res, next) => {
  try {
    const { start, end } = dateRange(req.query.period);
    const orders = await Order.find({ createdAt: { $gte: start, $lte: end } })
      .populate('customer', 'name email')
      .lean();

    const headers = 'Order Number,Customer,Email,Total,Status,Platform,Payment,Date\n';
    const rows    = orders.map(o =>
      `${o.orderNumber},"${o.customer?.name || 'Guest'}","${o.customer?.email || ''}",${o.total},${o.status},${o.platform},${o.paymentStatus},"${new Date(o.createdAt).toLocaleDateString()}"`
    ).join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="report-${req.query.period || '30d'}.csv"`);
    res.send(headers + rows);
  } catch (err) { next(err); }
};
