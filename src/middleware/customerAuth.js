const jwt      = require('jsonwebtoken');
const { getCustomerModel } = require('../models/Customer');

const protectCustomer = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, message: 'No token provided' });
    }
    const token    = authHeader.split(' ')[1];
    const decoded  = jwt.verify(token, process.env.JWT_SECRET);
    // Reject only when both sides carry a slug and they disagree — tokens
    // issued before this change have no slug claim and stay valid against the
    // default connection.
    if (decoded.slug && req.tenant && decoded.slug !== req.tenant.slug) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }
    const Customer = getCustomerModel(req.tenantConn);
    const customer = await Customer.findById(decoded.id);
    if (!customer || customer.status === 'blocked') {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }
    req.customer = customer;
    next();
  } catch (err) {
    next(err);
  }
};

module.exports = { protectCustomer };
