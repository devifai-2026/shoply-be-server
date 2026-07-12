const mongoose = require('mongoose');

const brandSchema = new mongoose.Schema({
  name:        { type: String, required: true, trim: true, unique: true },
  slug:        { type: String, required: true, unique: true, lowercase: true, trim: true },
  logo:        { type: String, default: null },
  description: { type: String, default: '' },
  website:     { type: String, default: '' },
  isActive:    { type: Boolean, default: true },
  sortOrder:   { type: Number, default: 0 },
  seoTitle:    { type: String, default: '' },
  seoDesc:     { type: String, default: '' },
}, { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } });

brandSchema.virtual('productCount', {
  ref:          'Product',
  localField:   'name',
  foreignField: 'brand',
  count:        true,
});

brandSchema.index({ sortOrder: 1, name: 1 });

// Default-connection model — the single shared `ecom.Brand` collection,
// preserved for any request that doesn't resolve to a tenant subdomain.
const BrandDefault = mongoose.model('Brand', brandSchema);

// Per-tenant-connection resolver. Each mongoose Connection keeps its own model
// registry, so registering 'Brand' on a tenant connection never collides with
// the default connection's registration (OverwriteModelError only happens when
// re-registering on the SAME connection).
function getBrandModel(conn) {
  if (!conn) return BrandDefault;
  return conn.models.Brand || conn.model('Brand', brandSchema);
}

module.exports = BrandDefault;
module.exports.getBrandModel = getBrandModel;
