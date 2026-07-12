const jwt    = require('jsonwebtoken');
const Vendor = require('../models/Vendor');

// Third auth tier alongside admin (auth.js) and customer (customerAuth.js).
// Vendor tokens carry { id, role: 'vendor' } so they can't be replayed
// against admin or customer routes (those look up different collections).
const protectVendor = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, message: 'No token provided' });
    }
    const token   = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded.role !== 'vendor') {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }
    const vendor = await Vendor.findById(decoded.id);
    if (!vendor) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }
    if (vendor.status === 'suspended' || vendor.status === 'rejected') {
      return res.status(403).json({ success: false, message: `Account ${vendor.status}` });
    }
    req.vendor = vendor;
    next();
  } catch (err) {
    if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
      return res.status(401).json({ success: false, message: 'Invalid token' });
    }
    next(err);
  }
};

// For routes that require the vendor to be fully approved (selling, payouts)
const requireApproved = (req, res, next) => {
  if (req.vendor.status !== 'approved') {
    return res.status(403).json({ success: false, message: 'Vendor account pending approval' });
  }
  next();
};

module.exports = { protectVendor, requireApproved };
