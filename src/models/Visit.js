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

// Default-connection model — the single shared `ecom.Visit` collection,
// preserved for any request that doesn't resolve to a tenant subdomain.
const VisitDefault = mongoose.model('Visit', visitSchema);

// Per-tenant-connection resolver. Each mongoose Connection keeps its own model
// registry, so registering 'Visit' on a tenant connection never collides with
// the default connection's registration (OverwriteModelError only happens when
// re-registering on the SAME connection).
function getVisitModel(conn) {
  if (!conn) return VisitDefault;
  return conn.models.Visit || conn.model('Visit', visitSchema);
}

module.exports = VisitDefault;
module.exports.getVisitModel = getVisitModel;
