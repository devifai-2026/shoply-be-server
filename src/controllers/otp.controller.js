const jwt      = require('jsonwebtoken');
const crypto   = require('crypto');
const Customer = require('../models/Customer');
const mc       = require('../services/messageCentral.service');

const signToken = (id) =>
  jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '30d' });

// POST /customer/otp/send
// Body: { phone }   → returns { verificationId }
exports.sendOtp = async (req, res, next) => {
  try {
    const { phone } = req.body;
    if (!phone || !/^\d{10}$/.test(phone.trim())) {
      return res.status(400).json({ success: false, message: 'Please provide a valid 10-digit phone number' });
    }

    const verificationId = await mc.sendOtp(phone.trim());
    res.json({ success: true, verificationId });
  } catch (err) {
    next(err);
  }
};

// POST /customer/otp/verify
// Body: { phone, verificationId, code }
// If phone already registered → login; else → auto-register and login
exports.verifyOtp = async (req, res, next) => {
  try {
    const { phone, verificationId, code } = req.body;

    if (!phone || !verificationId || !code) {
      return res.status(400).json({ success: false, message: 'phone, verificationId and code are required' });
    }

    const verified = await mc.verifyOtp(verificationId, code);
    if (!verified) {
      return res.status(400).json({ success: false, message: 'Invalid or expired OTP. Please try again.' });
    }

    let customer = await Customer.findOne({ phone: phone.trim() });
    let isNew = false;

    if (!customer) {
      customer = await Customer.create({
        name:     `User${phone.trim().slice(-4)}`,
        phone:    phone.trim(),
        email:    `${phone.trim()}@otp.in`,
        password: crypto.randomBytes(16).toString('hex'),
        platform: 'App',
      });
      isNew = true;
    }

    if (customer.status === 'blocked') {
      return res.status(403).json({ success: false, message: 'Your account has been suspended. Please contact support.' });
    }

    const token = signToken(customer._id);
    res.json({ success: true, token, customer, isNew });
  } catch (err) {
    next(err);
  }
};
