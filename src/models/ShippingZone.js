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

// Default-connection model — the single shared `ecom.ShippingZone` collection,
// preserved for any request that doesn't resolve to a tenant subdomain.
const ShippingZoneDefault = mongoose.model('ShippingZone', shippingZoneSchema);

// Per-tenant-connection resolver. Each mongoose Connection keeps its own model
// registry, so registering 'ShippingZone' on a tenant connection never collides with
// the default connection's registration (OverwriteModelError only happens when
// re-registering on the SAME connection).
function getShippingZoneModel(conn) {
  if (!conn) return ShippingZoneDefault;
  return conn.models.ShippingZone || conn.model('ShippingZone', shippingZoneSchema);
}

module.exports = ShippingZoneDefault;
module.exports.getShippingZoneModel = getShippingZoneModel;
