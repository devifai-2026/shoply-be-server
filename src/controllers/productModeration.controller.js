const { getProductModel } = require('../models/Product');
const { emitToVendor } = require('../socket');

exports.list = async (req, res, next) => {
  try {
    const Product = getProductModel(req.tenantConn);
    const filter = {};
    if (req.query.status && req.query.status !== 'all') filter.moderationStatus = req.query.status;
    if (req.query.vendor) filter.vendor = req.query.vendor;

    const page  = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, parseInt(req.query.limit) || 20);
    const skip  = (page - 1) * limit;

    const [rows, total] = await Promise.all([
      Product.find(filter)
        .populate('vendor', 'storeName')
        .populate('category', 'name')
        .sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      Product.countDocuments(filter),
    ]);
    res.json({ success: true, data: rows, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
  } catch (err) { next(err); }
};

exports.approve = async (req, res, next) => {
  try {
    const Product = getProductModel(req.tenantConn);
    const product = await Product.findOneAndUpdate(
      { _id: req.params.id, moderationStatus: { $in: ['pending', 'flagged'] } },
      { moderationStatus: 'approved', status: 'active', moderationNote: '' },
      { new: true },
    );
    if (!product) {
      return res.status(409).json({ success: false, message: 'Product already processed or not found' });
    }
    if (product.vendor) {
      emitToVendor(req.tenant?.slug, String(product.vendor), 'product:approved', {
        productId: String(product._id), name: product.name, via: 'admin',
      });
    }
    res.json({ success: true, data: product, message: 'Product approved' });
  } catch (err) { next(err); }
};

exports.reject = async (req, res, next) => {
  try {
    const Product = getProductModel(req.tenantConn);
    const product = await Product.findOneAndUpdate(
      { _id: req.params.id, moderationStatus: { $in: ['pending', 'flagged'] } },
      { moderationStatus: 'rejected', status: 'draft', moderationNote: req.body?.reason || '' },
      { new: true },
    );
    if (!product) {
      return res.status(409).json({ success: false, message: 'Product already processed or not found' });
    }
    if (product.vendor) {
      emitToVendor(req.tenant?.slug, String(product.vendor), 'product:rejected', {
        productId: String(product._id), name: product.name, reason: product.moderationNote,
      });
    }
    res.json({ success: true, data: product, message: 'Product rejected' });
  } catch (err) { next(err); }
};

exports.bulkApprove = async (req, res, next) => {
  try {
    const Product = getProductModel(req.tenantConn);
    const ids = Array.isArray(req.body?.ids) ? req.body.ids : [];
    if (!ids.length) return res.status(400).json({ success: false, message: 'No products selected' });

    // Fetch the matching set first so we know exactly which vendors to
    // notify — updateMany alone doesn't tell us which vendor each doc
    // belonged to.
    const targets = await Product.find({ _id: { $in: ids }, moderationStatus: { $in: ['pending', 'flagged'] } })
      .select('_id vendor name').lean();

    const result = await Product.updateMany(
      { _id: { $in: targets.map(t => t._id) } },
      { moderationStatus: 'approved', status: 'active', moderationNote: '' },
    );

    targets.forEach(t => {
      if (t.vendor) {
        emitToVendor(req.tenant?.slug, String(t.vendor), 'product:approved', {
          productId: String(t._id), name: t.name, via: 'admin',
        });
      }
    });

    res.json({
      success: true,
      data: { matchedCount: result.matchedCount, modifiedCount: result.modifiedCount },
      message: `${result.modifiedCount} of ${ids.length} product(s) approved`,
    });
  } catch (err) { next(err); }
};
