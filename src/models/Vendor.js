const mongoose = require('mongoose');
const bcrypt   = require('bcryptjs');

const vendorSchema = new mongoose.Schema({
  name:        { type: String, required: true, trim: true },
  email:       { type: String, required: true, unique: true, lowercase: true, trim: true },
  phone:       { type: String, default: '' },
  password:    { type: String, required: true, select: false },

  storeName:   { type: String, required: true, trim: true },
  slug:        { type: String, required: true, unique: true, lowercase: true },
  description: { type: String, default: '' },
  logo:        { type: String, default: null },
  banner:      { type: String, default: null },

  // KYC
  gstin: { type: String, default: '', trim: true, uppercase: true },
  pan:   { type: String, default: '', trim: true, uppercase: true },
  bankDetails: {
    accountName:   { type: String, default: '' },
    accountNumber: { type: String, default: '' },
    ifsc:          { type: String, default: '' },
    bankName:      { type: String, default: '' },
  },
  pickupAddress: {
    line1:   { type: String, default: '' },
    line2:   { type: String, default: '' },
    city:    { type: String, default: '' },
    state:   { type: String, default: '' },
    pincode: { type: String, default: '' },
    country: { type: String, default: 'India' },
    phone:   { type: String, default: '' },
  },

  // Marketplace terms
  commissionRate: { type: Number, default: 0, min: 0, max: 100 }, // % of item subtotal
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected', 'suspended'],
    default: 'pending',
  },
  statusNote: { type: String, default: '' }, // rejection/suspension reason

  rating:     { type: Number, default: 0 },
  totalSales: { type: Number, default: 0 }, // lifetime gross merchandise value
}, { timestamps: true });

vendorSchema.index({ status: 1 });
vendorSchema.index({ storeName: 'text', name: 'text', email: 'text' });

vendorSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

vendorSchema.methods.matchPassword = function (entered) {
  return bcrypt.compare(entered, this.password);
};

module.exports = mongoose.model('Vendor', vendorSchema);
