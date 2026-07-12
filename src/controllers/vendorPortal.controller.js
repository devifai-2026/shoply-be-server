const { getProductModel } = require('../models/Product');
const { getSubOrderModel } = require('../models/SubOrder');

// Turn uploaded files into server-relative URLs (served from /uploads)
exports.uploadImages = async (req, res, next) => {
  try {
    const files = req.files || [];
    if (!files.length) return res.status(400).json({ success: false, message: 'No images uploaded' });
    const urls = files.map(f => `/uploads/products/${f.filename}`);
    res.status(201).json({ success: true, data: { urls } });
  } catch (err) { next(err); }
};

const paginate = (req, cap = 50) => {
  const page  = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(cap, parseInt(req.query.limit) || 20);
  return { page, limit, skip: (page - 1) * limit };
};

// ─── Products (scoped to the vendor) ─────────────────────────────────────────

exports.listProducts = async (req, res, next) => {
  try {
    const Product = getProductModel(req.tenantConn);
    const { page, limit, skip } = paginate(req);
    const filter = { vendor: req.vendor._id };
    if (req.query.status && req.query.status !== 'all') filter.status = req.query.status;
    if (req.query.search) filter.$text = { $search: req.query.search };

    const [products, total] = await Promise.all([
      Product.find(filter).populate('category', 'name').sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      Product.countDocuments(filter),
    ]);
    res.json({ success: true, data: products, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
  } catch (err) { next(err); }
};

exports.createProduct = async (req, res, next) => {
  try {
    const Product = getProductModel(req.tenantConn);
    const body = { ...req.body };
    body.vendor = req.vendor._id;   // ownership is never client-chosen
    body.status = 'draft';          // vendor listings go live only when published
    delete body.soldCount; delete body.rating; delete body.reviewCount;
    const product = await Product.create(body);
    res.status(201).json({ success: true, data: product });
  } catch (err) { next(err); }
};

exports.updateProduct = async (req, res, next) => {
  try {
    const Product = getProductModel(req.tenantConn);
    const body = { ...req.body };
    delete body.vendor; delete body.soldCount; delete body.rating; delete body.reviewCount;
    const product = await Product.findOneAndUpdate(
      { _id: req.params.id, vendor: req.vendor._id },
      body,
      { new: true, runValidators: true },
    );
    if (!product) return res.status(404).json({ success: false, message: 'Product not found' });
    res.json({ success: true, data: product });
  } catch (err) { next(err); }
};

exports.deleteProduct = async (req, res, next) => {
  try {
    const Product = getProductModel(req.tenantConn);
    const product = await Product.findOneAndDelete({ _id: req.params.id, vendor: req.vendor._id });
    if (!product) return res.status(404).json({ success: false, message: 'Product not found' });
    res.json({ success: true, message: 'Product deleted' });
  } catch (err) { next(err); }
};

// ─── Sub-orders ──────────────────────────────────────────────────────────────

exports.listSubOrders = async (req, res, next) => {
  try {
    const SubOrder = getSubOrderModel(req.tenantConn);
    const { page, limit, skip } = paginate(req);
    const filter = { vendor: req.vendor._id };
    if (req.query.status && req.query.status !== 'all') filter.status = req.query.status;

    const [subOrders, total] = await Promise.all([
      SubOrder.find(filter)
        .populate('order', 'orderNumber shippingAddress paymentMethod paymentStatus createdAt')
        .sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      SubOrder.countDocuments(filter),
    ]);
    res.json({ success: true, data: subOrders, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
  } catch (err) { next(err); }
};

exports.getSubOrder = async (req, res, next) => {
  try {
    const SubOrder = getSubOrderModel(req.tenantConn);
    const subOrder = await SubOrder.findOne({ _id: req.params.id, vendor: req.vendor._id })
      .populate('order', 'orderNumber shippingAddress paymentMethod paymentStatus customer createdAt');
    if (!subOrder) return res.status(404).json({ success: false, message: 'Order not found' });
    res.json({ success: true, data: subOrder });
  } catch (err) { next(err); }
};

const VENDOR_STATUS_FLOW = {
  pending:    ['processing', 'cancelled'],
  processing: ['shipped', 'cancelled'],
  shipped:    ['delivered'],
};

exports.updateSubOrderStatus = async (req, res, next) => {
  try {
    const SubOrder = getSubOrderModel(req.tenantConn);
    const { status, trackingNumber, courierName, note } = req.body;
    const subOrder = await SubOrder.findOne({ _id: req.params.id, vendor: req.vendor._id });
    if (!subOrder) return res.status(404).json({ success: false, message: 'Order not found' });

    const allowed = VENDOR_STATUS_FLOW[subOrder.status] || [];
    if (!allowed.includes(status)) {
      return res.status(400).json({ success: false, message: `Cannot move from ${subOrder.status} to ${status}` });
    }

    subOrder.status = status;
    if (trackingNumber) subOrder.trackingNumber = trackingNumber;
    if (courierName)    subOrder.courierName = courierName;
    subOrder.timeline.push({ status, note: note || `Updated by vendor` });
    await subOrder.save();
    res.json({ success: true, data: subOrder });
  } catch (err) { next(err); }
};

// ─── Dashboard / analytics ───────────────────────────────────────────────────

exports.dashboard = async (req, res, next) => {
  try {
    const Product = getProductModel(req.tenantConn);
    const SubOrder = getSubOrderModel(req.tenantConn);
    const vendorId = req.vendor._id;
    const since30 = new Date(Date.now() - 30 * 24 * 3600 * 1000);

    const [totals, last30, statusCounts, productCount, lowStock, recent] = await Promise.all([
      SubOrder.aggregate([
        { $match: { vendor: vendorId, status: { $nin: ['cancelled', 'refunded'] } } },
        { $group: { _id: null, revenue: { $sum: '$subtotal' }, earning: { $sum: '$vendorEarning' }, orders: { $sum: 1 } } },
      ]),
      SubOrder.aggregate([
        { $match: { vendor: vendorId, createdAt: { $gte: since30 }, status: { $nin: ['cancelled', 'refunded'] } } },
        { $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
            revenue: { $sum: '$subtotal' }, orders: { $sum: 1 },
        } },
        { $sort: { _id: 1 } },
      ]),
      SubOrder.aggregate([
        { $match: { vendor: vendorId } },
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),
      Product.countDocuments({ vendor: vendorId }),
      Product.countDocuments({ vendor: vendorId, $expr: { $lte: ['$stock', '$alertLevel'] } }),
      SubOrder.find({ vendor: vendorId }).sort({ createdAt: -1 }).limit(5)
        .select('subNumber subtotal vendorEarning status createdAt').lean(),
    ]);

    res.json({
      success: true,
      data: {
        totalRevenue:  totals[0]?.revenue || 0,
        totalEarning:  totals[0]?.earning || 0,
        totalOrders:   totals[0]?.orders || 0,
        productCount,
        lowStockCount: lowStock,
        salesByDay:    last30,
        ordersByStatus: Object.fromEntries(statusCounts.map(s => [s._id, s.count])),
        recentOrders:  recent,
      },
    });
  } catch (err) { next(err); }
};

// ─── Earnings / payouts ──────────────────────────────────────────────────────

exports.earnings = async (req, res, next) => {
  try {
    const SubOrder = getSubOrderModel(req.tenantConn);
    const vendorId = req.vendor._id;
    const { page, limit, skip } = paginate(req);

    const [summary, rows, total] = await Promise.all([
      SubOrder.aggregate([
        { $match: { vendor: vendorId, status: 'delivered' } },
        { $group: {
            _id: { $ne: ['$settledAt', null] },
            earning: { $sum: '$vendorEarning' }, count: { $sum: 1 },
        } },
      ]),
      SubOrder.find({ vendor: vendorId, status: 'delivered' })
        .select('subNumber subtotal commissionRate commissionAmount vendorEarning settledAt createdAt')
        .sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      SubOrder.countDocuments({ vendor: vendorId, status: 'delivered' }),
    ]);

    const settled = summary.find(s => s._id === true);
    const pending = summary.find(s => s._id === false);
    res.json({
      success: true,
      data: {
        settledEarning: settled?.earning || 0,
        pendingEarning: pending?.earning || 0,
        entries: rows,
      },
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (err) { next(err); }
};
