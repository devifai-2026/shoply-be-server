const jwt    = require('jsonwebtoken');
const { getVendorModel } = require('../models/Vendor');
const { getAdminNotificationModel } = require('../models/AdminNotification');

const signToken = (id, slug) =>
  jwt.sign({ id, role: 'vendor', slug: slug || null }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });

const slugify = (s) =>
  s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

const publicVendor = (v) => {
  const o = v.toObject ? v.toObject() : { ...v };
  delete o.password;
  return o;
};

exports.register = async (req, res, next) => {
  try {
    const { name, email, password, phone, storeName, description, gstin, pan, bankDetails, pickupAddress } = req.body;
    if (!name || !email || !password || !storeName) {
      return res.status(400).json({ success: false, message: 'name, email, password and storeName are required' });
    }
    if (password.length < 8) {
      return res.status(400).json({ success: false, message: 'Password must be at least 8 characters' });
    }
    const Vendor = getVendorModel(req.tenantConn);
    const exists = await Vendor.findOne({ email: email.toLowerCase() });
    if (exists) {
      return res.status(409).json({ success: false, message: 'A vendor with this email already exists' });
    }

    // Unique slug from the store name
    let slug = slugify(storeName) || `store-${Date.now()}`;
    if (await Vendor.exists({ slug })) slug = `${slug}-${Date.now().toString(36)}`;

    const vendor = await Vendor.create({
      name, email, password, phone, storeName, slug,
      description: description || '',
      gstin: gstin || '', pan: pan || '',
      bankDetails: bankDetails || {},
      pickupAddress: pickupAddress || {},
    });

    const AdminNotification = getAdminNotificationModel(req.tenantConn);
    await AdminNotification.create({
      type:    'vendor',
      title:   'New Vendor Registration',
      message: `${storeName} (${email}) is awaiting approval`,
      link:    `/vendors/${vendor._id}`,
    });

    res.status(201).json({
      success: true,
      token:   signToken(vendor._id, req.tenant?.slug),
      data:    publicVendor(vendor),
      message: 'Registration received — your store is pending approval',
    });
  } catch (err) { next(err); }
};

exports.login = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const Vendor = getVendorModel(req.tenantConn);
    const vendor = await Vendor.findOne({ email: (email || '').toLowerCase() }).select('+password');
    if (!vendor || !(await vendor.matchPassword(password || ''))) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }
    if (vendor.status === 'suspended') {
      return res.status(403).json({ success: false, message: 'Account suspended — contact support' });
    }
    res.json({ success: true, token: signToken(vendor._id, req.tenant?.slug), data: publicVendor(vendor) });
  } catch (err) { next(err); }
};

exports.me = async (req, res) => {
  res.json({ success: true, data: publicVendor(req.vendor) });
};

exports.updateProfile = async (req, res, next) => {
  try {
    const allowed = ['name', 'phone', 'description', 'bankDetails', 'pickupAddress', 'shippingSettings', 'gstEnabled', 'gstin'];
    allowed.forEach((k) => {
      if (req.body[k] !== undefined) req.vendor[k] = req.body[k];
    });
    await req.vendor.save();
    res.json({ success: true, data: publicVendor(req.vendor) });
  } catch (err) { next(err); }
};

exports.changePassword = async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ success: false, message: 'Please provide both current and new passwords' });
    }
    if (newPassword.length < 8) {
      return res.status(400).json({ success: false, message: 'New password must be at least 8 characters' });
    }
    const Vendor = getVendorModel(req.tenantConn);
    const vendor = await Vendor.findById(req.vendor._id).select('+password');
    if (!(await vendor.matchPassword(currentPassword))) {
      return res.status(400).json({ success: false, message: 'Current password is incorrect' });
    }
    vendor.password = newPassword;
    await vendor.save();
    res.json({ success: true, message: 'Password updated successfully' });
  } catch (err) { next(err); }
};
