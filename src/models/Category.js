const mongoose = require('mongoose');

const categorySchema = new mongoose.Schema({
  name:        { type: String, required: true, trim: true },
  slug:        { type: String, required: true, unique: true, lowercase: true, trim: true },
  icon:        { type: String, default: '📦' },
  image:       { type: String, default: null },
  parent:      { type: mongoose.Schema.Types.ObjectId, ref: 'Category', default: null },
  depth:       { type: Number, default: 0 },
  sortOrder:   { type: Number, default: 0 },
  isActive:    { type: Boolean, default: true },
  description: { type: String, default: '' },
  seoTitle:    { type: String, default: '' },
  seoDesc:     { type: String, default: '' },
  // Per-locale display names for the Flutter app's language switcher
  // (en/hi/bn) — falls back to `name` when a translation isn't set.
  translations: {
    hi: { type: String, default: '' },
    bn: { type: String, default: '' },
  },
}, { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } });

categorySchema.virtual('productCount', {
  ref:         'Product',
  localField:  '_id',
  foreignField: 'category',
  count:       true,
});

categorySchema.virtual('subCategories', {
  ref:         'Category',
  localField:  '_id',
  foreignField: 'parent',
});

categorySchema.index({ parent: 1, sortOrder: 1 });

// Default-connection model — the single shared `ecom.Category` collection,
// preserved for any request that doesn't resolve to a tenant subdomain.
const CategoryDefault = mongoose.model('Category', categorySchema);

// Per-tenant-connection resolver. Each mongoose Connection keeps its own model
// registry, so registering 'Category' on a tenant connection never collides with
// the default connection's registration (OverwriteModelError only happens when
// re-registering on the SAME connection).
function getCategoryModel(conn) {
  if (!conn) return CategoryDefault;
  return conn.models.Category || conn.model('Category', categorySchema);
}

module.exports = CategoryDefault;
module.exports.getCategoryModel = getCategoryModel;
