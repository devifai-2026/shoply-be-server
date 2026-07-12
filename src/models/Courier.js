const mongoose = require('mongoose');

const courierSchema = new mongoose.Schema({
  name:     { type: String, required: true, trim: true },
  slug:     { type: String, required: true, unique: true },
  logo:     { type: String, default: null },
  apiKey:   { type: String, default: '', select: false },
  apiSecret: { type: String, default: '', select: false },
  // Cached auth token (Shiprocket rotates every 10 days)
  token:       { type: String, default: null, select: false },
  tokenExpiry: { type: Date,   default: null, select: false },
  isActive: { type: Boolean, default: false },
  trackingUrl: { type: String, default: '' },
  supportedZones: [{ type: String }],
}, { timestamps: true });

module.exports = mongoose.model('Courier', courierSchema);
