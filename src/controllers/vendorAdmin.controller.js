const { getVendorModel }   = require('../models/Vendor');
const { getProductModel }  = require('../models/Product');
const { getSubOrderModel } = require('../models/SubOrder');

const paginate = (req, cap = 50) => {
  const page  = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(cap, parseInt(req.query.limit) || 20);
  return { page, limit, skip: (page - 1) * limit };
};

exports.list = async (req, res, next) => {
  try {
    const Vendor = getVendorModel(req.tenantConn);
    const { page, limit, skip } = paginate(req);
    const filter = {};
    if (req.query.status && req.query.status !== 'all') filter.status = req.query.status;
    if (req.query.search) {
      const rx = new RegExp(req.query.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.$or = [{ storeName: rx }, { name: rx }, { email: rx }];
    }

    const [vendors, total] = await Promise.all([
      Vendor.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      Vendor.countDocuments(filter),
    ]);
    res.json({ success: true, data: vendors, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
  } catch (err) { next(err); }
};

exports.stats = async (req, res, next) => {
  try {
    const Vendor = getVendorModel(req.tenantConn);
    const rows = await Vendor.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]);
    const byStatus = Object.fromEntries(rows.map(r => [r._id, r.count]));
    res.json({
      success: true,
      data: {
        total:     rows.reduce((s, r) => s + r.count, 0),
        pending:   byStatus.pending || 0,
        approved:  byStatus.approved || 0,
        suspended: byStatus.suspended || 0,
        rejected:  byStatus.rejected || 0,
      },
    });
  } catch (err) { next(err); }
};

exports.get = async (req, res, next) => {
  try {
    const Vendor = getVendorModel(req.tenantConn);
    const vendor = await Vendor.findById(req.params.id).lean();
    if (!vendor) return res.status(404).json({ success: false, message: 'Vendor not found' });
    res.json({ success: true, data: vendor });
  } catch (err) { next(err); }
};

exports.update = async (req, res, next) => {
  try {
    const Vendor = getVendorModel(req.tenantConn);
    const allowed = ['commissionRate', 'storeName', 'description', 'phone', 'gstin', 'pan', 'bankDetails', 'pickupAddress', 'shiprocketPickupLocation'];
    const updates = {};
    allowed.forEach(k => { if (req.body[k] !== undefined) updates[k] = req.body[k]; });
    const vendor = await Vendor.findByIdAndUpdate(req.params.id, updates, { new: true, runValidators: true });
    if (!vendor) return res.status(404).json({ success: false, message: 'Vendor not found' });
    res.json({ success: true, data: vendor });
  } catch (err) { next(err); }
};

const setStatus = (status) => async (req, res, next) => {
  try {
    const Vendor = getVendorModel(req.tenantConn);
    const vendor = await Vendor.findByIdAndUpdate(
      req.params.id,
      { status, statusNote: req.body?.reason || '' },
      { new: true },
    );
    if (!vendor) return res.status(404).json({ success: false, message: 'Vendor not found' });
    res.json({ success: true, data: vendor, message: `Vendor ${status}` });
  } catch (err) { next(err); }
};

exports.approve    = setStatus('approved');
exports.reject     = setStatus('rejected');
exports.suspend    = setStatus('suspended');
exports.reactivate = setStatus('approved');

exports.listProducts = async (req, res, next) => {
  try {
    const Product = getProductModel(req.tenantConn);
    const { page, limit, skip } = paginate(req);
    const filter = { vendor: req.params.id };
    const [products, total] = await Promise.all([
      Product.find(filter).populate('category', 'name').sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      Product.countDocuments(filter),
    ]);
    res.json({ success: true, data: products, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
  } catch (err) { next(err); }
};

exports.listSubOrders = async (req, res, next) => {
  try {
    const SubOrder = getSubOrderModel(req.tenantConn);
    const { page, limit, skip } = paginate(req);
    const filter = { vendor: req.params.id };
    const [subOrders, total] = await Promise.all([
      SubOrder.find(filter).populate('order', 'orderNumber paymentStatus').sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      SubOrder.countDocuments(filter),
    ]);
    res.json({ success: true, data: subOrders, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
  } catch (err) { next(err); }
};
