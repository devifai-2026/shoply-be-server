const mongoose = require('mongoose');

const shippingZoneSchema = new mongoose.Schema({
  name:        { type: String, required: true, trim: true },
  coverageArea: { type: String, required: true },
  baseRate:    { type: Number, required: true, min: 0 },
  freeAbove:   { type: Number, default: null },
  estimatedDays: { type: String, default: '3-5 Days' },
  isActive:    { type: Boolean, default: true },
  sortOrder:   { type: Number, default: 0 },
  pincodes:    [{ type: String }],
  states:      [{ type: String }],
}, { timestamps: true });

module.exports = mongoose.model('ShippingZone', shippingZoneSchema);
