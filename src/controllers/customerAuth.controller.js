const crypto   = require('crypto');
const jwt      = require('jsonwebtoken');
const Customer = require('../models/Customer');
const emailService = require('../services/email.service');

const signToken = (id) =>
  jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '30d' });

exports.register = async (req, res, next) => {
  try {
    const { name, email, password, phone } = req.body;

    // Basic validation
    if (!name || !email || !password) {
      return res.status(400).json({ 
        success: false, 
        message: 'Please provide name, email, and password' 
      });
    }

    // Check if email already exists
    const emailExists = await Customer.findOne({ email });
    if (emailExists) {
      return res.status(400).json({ 
        success: false, 
        message: 'This email is already registered. Please login instead.' 
      });
    }

    // Check if phone exists (if provided)
    if (phone) {
      const phoneExists = await Customer.findOne({ phone });
      if (phoneExists) {
        return res.status(400).json({ 
          success: false, 
          message: 'This phone number is already registered' 
        });
      }
    }

    const customer = await Customer.create({ 
      name, 
      email, 
      password, 
      phone: phone || '', 
      platform: 'Web' 
    });

    const token = signToken(customer._id);

    res.status(201).json({ 
      success: true, 
      token, 
      customer 
    });
  } catch (err) { 
    next(err); 
  }
};

exports.login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    // Basic validation
    if (!email || !password) {
      return res.status(400).json({ 
        success: false, 
        message: 'Please provide an email and password' 
      });
    }

    // Find customer & include password
    const customer = await Customer.findOne({ email }).select('+password');

    if (!customer) {
      return res.status(401).json({ 
        success: false, 
        message: 'Invalid credentials. Please check your email and password.' 
      });
    }

    // Check if password matches
    const isMatch = await customer.matchPassword(password);
    if (!isMatch) {
      return res.status(401).json({ 
        success: false, 
        message: 'Invalid credentials. Please check your email and password.' 
      });
    }

    // Check if account is active
    if (customer.status === 'blocked') {
      return res.status(403).json({ 
        success: false, 
        message: 'Your account has been suspended. Please contact support.' 
      });
    }

    const token = signToken(customer._id);

    res.status(200).json({ 
      success: true, 
      token, 
      customer 
    });
  } catch (err) { 
    next(err); 
  }
};

exports.me = async (req, res) => {
  try {
    const customer = await Customer.findById(req.customer._id);
    if (!customer) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    res.json({ success: true, customer });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

exports.updateProfile = async (req, res, next) => {
  try {
    const { name, phone, avatar } = req.body;
    
    const updateFields = {};
    if (name) updateFields.name = name;
    if (phone) updateFields.phone = phone;
    if (avatar) updateFields.avatar = avatar;

    const customer = await Customer.findByIdAndUpdate(
      req.customer._id, 
      updateFields, 
      { new: true, runValidators: true }
    );

    res.json({ success: true, customer });
  } catch (err) { 
    next(err); 
  }
};

exports.changePassword = async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ 
        success: false, 
        message: 'Please provide both current and new passwords' 
      });
    }

    const customer = await Customer.findById(req.customer._id).select('+password');
    
    if (!(await customer.matchPassword(currentPassword))) {
      return res.status(400).json({ 
        success: false, 
        message: 'The current password you entered is incorrect' 
      });
    }

    customer.password = newPassword;
    await customer.save();

    res.json({ 
      success: true, 
      message: 'Password has been updated successfully' 
    });
  } catch (err) { 
    next(err); 
  }
};

// Address Management
exports.getAddresses = async (req, res, next) => {
  try {
    const customer = await Customer.findById(req.customer._id).select('addresses');
    res.json({ success: true, addresses: customer.addresses });
  } catch (err) { 
    next(err); 
  }
};

exports.addAddress = async (req, res, next) => {
  try {
    const { label, name, phone, line1, line2, city, state, pincode, country, isDefault } = req.body;
    
    const customer = await Customer.findById(req.customer._id);
    
    // If setting as default, unset others
    if (isDefault) {
      customer.addresses.forEach(addr => addr.isDefault = false);
    }
    
    // If first address, make it default
    const newAddress = { 
      label, name, phone, line1, line2, city, state, pincode, 
      country: country || 'India', 
      isDefault: customer.addresses.length === 0 ? true : !!isDefault 
    };
    
    customer.addresses.push(newAddress);
    await customer.save();
    
    res.status(201).json({ success: true, addresses: customer.addresses });
  } catch (err) { 
    next(err); 
  }
};

exports.updateAddress = async (req, res, next) => {
  try {
    const { addressId } = req.params;
    const updates = req.body;
    
    const customer = await Customer.findById(req.customer._id);
    const address = customer.addresses.id(addressId);
    
    if (!address) {
      return res.status(404).json({ success: false, message: 'Address not found' });
    }
    
    // If setting as default
    if (updates.isDefault) {
      customer.addresses.forEach(addr => addr.isDefault = false);
    }
    
    Object.assign(address, updates);
    await customer.save();
    
    res.json({ success: true, addresses: customer.addresses });
  } catch (err) { 
    next(err); 
  }
};

exports.deleteAddress = async (req, res, next) => {
  try {
    const { addressId } = req.params;
    const customer = await Customer.findById(req.customer._id);
    
    const address = customer.addresses.id(addressId);
    if (!address) {
      return res.status(404).json({ success: false, message: 'Address not found' });
    }
    
    const wasDefault = address.isDefault;
    customer.addresses.pull(addressId);
    
    // If we deleted default, make first remaining default
    if (wasDefault && customer.addresses.length > 0) {
      customer.addresses[0].isDefault = true;
    }
    
    await customer.save();
    res.json({ success: true, addresses: customer.addresses });
  } catch (err) { 
    next(err); 
  }
};

exports.setDefaultAddress = async (req, res, next) => {
  try {
    const { addressId } = req.params;
    const customer = await Customer.findById(req.customer._id);

    let found = false;
    customer.addresses.forEach(addr => {
      if (addr._id.toString() === addressId) {
        addr.isDefault = true;
        found = true;
      } else {
        addr.isDefault = false;
      }
    });

    if (!found) {
      return res.status(404).json({ success: false, message: 'Address not found' });
    }

    await customer.save();
    res.json({ success: true, addresses: customer.addresses });
  } catch (err) {
    next(err);
  }
};

exports.forgotPassword = async (req, res, next) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ success: false, message: 'Please provide an email address' });
    }

    const customer = await Customer.findOne({ email });

    // Always return success to prevent email enumeration
    if (!customer) {
      return res.json({ success: true, message: 'If an account exists with this email, a reset link has been sent.' });
    }

    const resetToken = crypto.randomBytes(32).toString('hex');
    const hashedToken = crypto.createHash('sha256').update(resetToken).digest('hex');

    customer.resetPasswordToken = hashedToken;
    customer.resetPasswordExpire = Date.now() + 10 * 60 * 1000; // 10 min
    await customer.save({ validateBeforeSave: false });

    const resetUrl = `${process.env.STOREFRONT_URL || 'http://localhost:5173'}/reset-password/${resetToken}`;

    try {
      await emailService.sendPasswordResetEmail({ toEmail: customer.email, toName: customer.name, resetUrl });
    } catch (emailErr) {
      customer.resetPasswordToken = undefined;
      customer.resetPasswordExpire = undefined;
      await customer.save({ validateBeforeSave: false });
      return res.status(500).json({ success: false, message: 'Failed to send reset email. Please try again.' });
    }

    res.json({ success: true, message: 'Password reset link has been sent to your email.' });
  } catch (err) {
    next(err);
  }
};

exports.resetPassword = async (req, res, next) => {
  try {
    const { token } = req.params;
    const { password } = req.body;

    if (!password || password.length < 6) {
      return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' });
    }

    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

    const customer = await Customer.findOne({
      resetPasswordToken: hashedToken,
      resetPasswordExpire: { $gt: Date.now() },
    });

    if (!customer) {
      return res.status(400).json({ success: false, message: 'Password reset link is invalid or has expired.' });
    }

    customer.password = password;
    customer.resetPasswordToken = undefined;
    customer.resetPasswordExpire = undefined;
    await customer.save();

    const jwtToken = signToken(customer._id);
    res.json({ success: true, message: 'Password has been reset successfully.', token: jwtToken });
  } catch (err) {
    next(err);
  }
};
