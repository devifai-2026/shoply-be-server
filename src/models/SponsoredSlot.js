const mongoose = require('mongoose');

// Admin-curated "Featured"/"Sponsored" placement — no vendor payment flow,
// no spend tracking. The admin picks a product (vendor-owned or store-owned)
// into a numbered slot; the storefront's Sponsored section reads active
// slots in order and hides entirely when none are configured.
const sponsoredSlotSchema = new mongoose.Schema({
  product:  { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  position: { type: Number, default: 0 },
  startsAt: { type: Date, default: null },
  endsAt:   { type: Date, default: null },
  isActive: { type: Boolean, default: true },
}, { timestamps: true });

sponsoredSlotSchema.virtual('isLive').get(function () {
  const now = new Date();
  if (!this.isActive) return false;
  if (this.startsAt && now < this.startsAt) return false;
  if (this.endsAt   && now > this.endsAt)   return false;
  return true;
});

sponsoredSlotSchema.index({ isActive: 1, position: 1 });

// Default-connection model — the single shared `ecom.SponsoredSlot`
// collection, preserved for any request that doesn't resolve to a tenant subdomain.
const SponsoredSlotDefault = mongoose.model('SponsoredSlot', sponsoredSlotSchema);

// Per-tenant-connection resolver. Each mongoose Connection keeps its own model
// registry, so registering 'SponsoredSlot' on a tenant connection never
// collides with the default connection's registration.
function getSponsoredSlotModel(conn) {
  if (!conn) return SponsoredSlotDefault;
  return conn.models.SponsoredSlot || conn.model('SponsoredSlot', sponsoredSlotSchema);
}

module.exports = SponsoredSlotDefault;
module.exports.getSponsoredSlotModel = getSponsoredSlotModel;
