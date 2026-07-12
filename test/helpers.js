const jwt = require('jsonwebtoken');

function customerToken(customerId) {
  return jwt.sign({ id: String(customerId) }, process.env.JWT_SECRET, { expiresIn: '1h' });
}

function vendorToken(vendorId) {
  return jwt.sign({ id: String(vendorId), role: 'vendor' }, process.env.JWT_SECRET, { expiresIn: '1h' });
}

function adminToken(adminId) {
  return jwt.sign({ id: String(adminId) }, process.env.JWT_SECRET, { expiresIn: '1h' });
}

module.exports = { customerToken, vendorToken, adminToken };
