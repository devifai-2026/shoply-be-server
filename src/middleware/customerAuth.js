const jwt      = require('jsonwebtoken');
const Customer = require('../models/Customer');

const protectCustomer = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, message: 'No token provided' });
    }
    const token    = authHeader.split(' ')[1];
    const decoded  = jwt.verify(token, process.env.JWT_SECRET);
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
