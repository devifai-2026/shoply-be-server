const crypto = require('crypto');
const { getVendorModel }   = require('../models/Vendor');
const { getProductModel }  = require('../models/Product');
const { getSubOrderModel } = require('../models/SubOrder');
const emailService = require('../services/email.service');

const slugify = (s) =>
  s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

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

// Admin creates a vendor directly — skips the self-registration pending
// queue entirely, since the admin is vouching for this seller themselves.
// Generates a temp password and returns it ONCE in the response (never
// retrievable again, same "shown once" convention used for PO-console
// admin-credential reveal/rotate); also emails it if SMTP is configured.
exports.create = async (req, res, next) => {
  try {
    const { name, email, phone, storeName, commissionRate } = req.body;
    if (!name || !email || !storeName) {
      return res.status(400).json({ success: false, message: 'name, email and storeName are required' });
    }
    const Vendor = getVendorModel(req.tenantConn);
    const exists = await Vendor.findOne({ email: email.toLowerCase() });
    if (exists) {
      return res.status(409).json({ success: false, message: 'A vendor with this email already exists' });
    }

    let slug = slugify(storeName) || `store-${Date.now()}`;
    if (await Vendor.exists({ slug })) slug = `${slug}-${Date.now().toString(36)}`;

    const tempPassword = crypto.randomBytes(9).toString('base64url');

    const vendor = await Vendor.create({
      name, email, phone: phone || '', storeName, slug,
      password: tempPassword,
      commissionRate: Number(commissionRate) || 0,
      status: 'approved', // admin-created — no pending review needed
    });

    const root = process.env.SAAS_PUBLIC_DOMAIN;
    const loginUrl = req.tenant?.slug && root
      ? `https://${req.tenant.slug}.seller.${root}`
      : '';

    emailService.sendVendorInviteEmail({
      toEmail: email, toName: name, storeName, tempPassword, loginUrl,
    }).catch(err => console.error('[VendorInvite] email failed:', err.message));

    const publicVendor = vendor.toObject();
    delete publicVendor.password;

    res.status(201).json({
      success: true,
      data: publicVendor,
      tempPassword,
      message: 'Vendor created — share the temporary password shown below (it will not be shown again)',
    });
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
    const allowed = ['commissionRate', 'storeName', 'description', 'phone', 'gstin', 'pan', 'bankDetails', 'pickupAddress', 'shiprocketPickupLocation', 'autoApprove'];
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
