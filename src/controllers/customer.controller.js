const Customer = require('../models/Customer');
const Order    = require('../models/Order');

exports.list = async (req, res, next) => {
  try {
    const page  = Math.max(1, parseInt(req.query.page)  || 1);
    const limit = Math.min(100, parseInt(req.query.limit) || 20);
    const skip  = (page - 1) * limit;
    const filter = {};

    if (req.query.type && req.query.type !== 'all') filter.type = req.query.type;
    if (req.query.platform) filter.platform = req.query.platform;
    if (req.query.search)   filter.$text = { $search: req.query.search };

    const [customers, total] = await Promise.all([
      Customer.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
      Customer.countDocuments(filter),
    ]);

    res.json({ success: true, data: customers, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
  } catch (err) { next(err); }
};

exports.getOne = async (req, res, next) => {
  try {
    const customer = await Customer.findById(req.params.id);
    if (!customer) return res.status(404).json({ success: false, message: 'Customer not found' });

    const recentOrders = await Order.find({ customer: req.params.id })
      .sort({ createdAt: -1 })
      .limit(5)
      .select('orderNumber total status platform createdAt');

    res.json({ success: true, data: { ...customer.toObject(), recentOrders } });
  } catch (err) { next(err); }
};

exports.block = async (req, res, next) => {
  try {
    const customer = await Customer.findByIdAndUpdate(
      req.params.id,
      { status: 'blocked', type: 'blocked' },
      { new: true }
    );
    if (!customer) return res.status(404).json({ success: false, message: 'Customer not found' });
    res.json({ success: true, message: `${customer.name} has been blocked`, data: customer });
  } catch (err) { next(err); }
};

exports.unblock = async (req, res, next) => {
  try {
    const customer = await Customer.findByIdAndUpdate(
      req.params.id,
      { status: 'active', type: 'returning' },
      { new: true }
    );
    if (!customer) return res.status(404).json({ success: false, message: 'Customer not found' });
    res.json({ success: true, message: `${customer.name} has been unblocked`, data: customer });
  } catch (err) { next(err); }
};

exports.exportCSV = async (req, res, next) => {
  try {
    const filter = {};
    if (req.query.type && req.query.type !== 'all') filter.type = req.query.type;
    const customers = await Customer.find(filter).lean();

    const headers = 'Name,Email,Phone,Platform,Orders,Total Spent,Status\n';
    const rows    = customers.map(c =>
      `"${c.name}","${c.email}","${c.phone}",${c.platform},${c.orderCount},${c.totalSpent},${c.status}`
    ).join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="customers.csv"');
    res.send(headers + rows);
  } catch (err) { next(err); }
};

exports.addAddress = async (req, res, next) => {
  try {
    const customer = await Customer.findByIdAndUpdate(
      req.params.id,
      { $push: { addresses: req.body } },
      { new: true }
    );
    if (!customer) return res.status(404).json({ success: false, message: 'Customer not found' });
    res.json({ success: true, data: customer });
  } catch (err) { next(err); }
};
