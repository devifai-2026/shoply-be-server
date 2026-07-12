const mongoose = require('mongoose');

const visitSchema = new mongoose.Schema({
  visitorId:  { type: String, required: true },
  sessionId:  { type: String, default: null },
  ip:         { type: String, default: null },
  geo: {
    country: { type: String, default: null },
    region:  { type: String, default: null },
    city:    { type: String, default: null },
    lat:     { type: Number, default: null },
    lng:     { type: Number, default: null },
  },
  device: {
    browser:    { type: String, default: null },
    os:         { type: String, default: null },
    deviceType: { type: String, default: null },
  },
  platform:   { type: String, enum: ['Web', 'App'], default: 'Web' },
  eventType:  { type: String, enum: ['page_view', 'product_view', 'product_click'], required: true },
  path:       { type: String, default: null },
  product:    { type: mongoose.Schema.Types.ObjectId, ref: 'Product', default: null },
  customer:   { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', default: null },
  referrer:   { type: String, default: null },
}, { timestamps: true });

visitSchema.index({ createdAt: -1 });
visitSchema.index({ 'geo.country': 1 });
visitSchema.index({ product: 1 });
visitSchema.index({ visitorId: 1 });
// Auto-purge raw IP/visit records after 180 days
visitSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 180 });

module.exports = mongoose.model('Visit', visitSchema);
