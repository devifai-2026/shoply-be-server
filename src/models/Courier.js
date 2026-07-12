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

// Default-connection model — the single shared `ecom.Courier` collection,
// preserved for any request that doesn't resolve to a tenant subdomain.
const CourierDefault = mongoose.model('Courier', courierSchema);

// Per-tenant-connection resolver. Each mongoose Connection keeps its own model
// registry, so registering 'Courier' on a tenant connection never collides with
// the default connection's registration (OverwriteModelError only happens when
// re-registering on the SAME connection).
function getCourierModel(conn) {
  if (!conn) return CourierDefault;
  return conn.models.Courier || conn.model('Courier', courierSchema);
}

module.exports = CourierDefault;
module.exports.getCourierModel = getCourierModel;
