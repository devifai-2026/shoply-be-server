const mongoose = require('mongoose');

const flashSaleProductSchema = new mongoose.Schema({
  product:       { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  salePrice:     { type: Number, required: true },
  originalPrice: { type: Number, required: true },
  stockLimit:    { type: Number, default: null },
  soldCount:     { type: Number, default: 0 },
}, { _id: true });

const flashSaleSchema = new mongoose.Schema({
  title:          { type: String, required: true, trim: true },
  discountPercent: { type: Number, required: true, min: 1, max: 100 },
  startsAt:       { type: Date, required: true },
  endsAt:         { type: Date, required: true },
  products:       [flashSaleProductSchema],
  platforms:      { type: String, enum: ['both', 'web', 'app'], default: 'both' },
  isActive:       { type: Boolean, default: false },
  bannerImage:    { type: String, default: null },
  badge:          { type: String, default: 'SALE' },
}, { timestamps: true });

flashSaleSchema.virtual('isLive').get(function () {
  const now = new Date();
  return this.isActive && this.startsAt <= now && this.endsAt >= now;
});

flashSaleSchema.index({ isActive: 1, startsAt: 1, endsAt: 1 });

// Default-connection model — the single shared `ecom.FlashSale` collection,
// preserved for any request that doesn't resolve to a tenant subdomain.
const FlashSaleDefault = mongoose.model('FlashSale', flashSaleSchema);

// Per-tenant-connection resolver. Each mongoose Connection keeps its own model
// registry, so registering 'FlashSale' on a tenant connection never collides with
// the default connection's registration (OverwriteModelError only happens when
// re-registering on the SAME connection).
function getFlashSaleModel(conn) {
  if (!conn) return FlashSaleDefault;
  return conn.models.FlashSale || conn.model('FlashSale', flashSaleSchema);
}

module.exports = FlashSaleDefault;
module.exports.getFlashSaleModel = getFlashSaleModel;
