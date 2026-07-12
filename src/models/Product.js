const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  name:          { type: String, required: true, trim: true },
  description:   { type: String, default: '' },
  author:        { type: String, default: '', trim: true },
  brand:         { type: String, default: '' },
  // null = store-owned; set = marketplace vendor's listing
  vendor:        { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor', default: null },
  category:      { type: mongoose.Schema.Types.ObjectId, ref: 'Category', required: true },
  sku:           { type: String, required: true, unique: true, trim: true, uppercase: true },
  price:         { type: Number, required: true, min: 0 },
  discountPrice: { type: Number, default: null, min: 0 },
  gstRate:       { type: Number, default: null, min: 0, max: 100 }, // null = fall back to StoreSettings.orders.gstRate
  stock:         { type: Number, required: true, default: 0, min: 0 },
  alertLevel:    { type: Number, default: 10 },
  images:        [{ type: String }],
  status:        { type: String, enum: ['active', 'draft', 'archived'], default: 'draft' },
  visibleWeb:    { type: Boolean, default: true },
  visibleApp:    { type: Boolean, default: true },
  tags:          [{ type: String, trim: true }],
  seoTitle:      { type: String, default: '' },
  seoDesc:       { type: String, default: '' },
  seoKeywords:   { type: String, default: '' },
  attributes:    { type: Map, of: String, default: {} },
  soldCount:     { type: Number, default: 0 },
  rating:        { type: Number, default: 0 },
  reviewCount:   { type: Number, default: 0 },

  // Seller-toggleable checkout add-on: gift wrapping for this product.
  giftWrap: {
    enabled: { type: Boolean, default: false },
    price:   { type: Number, default: 0, min: 0 },
  },

  // Seller-toggleable checkout upsell: "buy this + product Y for a bundle price".
  // Surfaced on the checkout page as an optional add-on toggle.
  bundleOffer: {
    enabled:      { type: Boolean, default: false },
    withProduct:  { type: mongoose.Schema.Types.ObjectId, ref: 'Product', default: null },
    bundlePrice:  { type: Number, default: null, min: 0 }, // combined price when both are bought together
  },

  // Moderation — separate axis from `status`. `status` still controls
  // storefront visibility exactly as before; a product only ever reaches
  // status:'active' for the first time once moderationStatus reaches
  // 'approved' or 'ai_approved' (see vendorPortal.controller.js createProduct).
  moderationStatus: {
    type: String,
    enum: ['pending', 'ai_approved', 'flagged', 'approved', 'rejected'],
    default: 'pending',
  },
  moderationNote: { type: String, default: '' }, // AI flag reason or admin rejection reason
  aiReview: {
    checkedAt:  { type: Date, default: null },
    confidence: { type: Number, default: null, min: 0, max: 1 },
    raw:        { type: String, default: '' }, // full AI response text, for admin/debug visibility
  },
}, { timestamps: true });

productSchema.virtual('stockStatus').get(function () {
  if (this.stock === 0) return 'out';
  if (this.stock <= this.alertLevel) return 'low';
  return 'ok';
});

productSchema.virtual('discountPercent').get(function () {
  if (!this.discountPrice || this.discountPrice >= this.price) return 0;
  return Math.round((1 - this.discountPrice / this.price) * 100);
});

productSchema.index({ name: 'text', sku: 'text', brand: 'text', author: 'text' });
productSchema.index({ category: 1, status: 1 });
productSchema.index({ vendor: 1, status: 1 });
productSchema.index({ stock: 1 });
productSchema.index({ moderationStatus: 1, createdAt: -1 });

// Default-connection model — the single shared `ecom.Product` collection,
// preserved for any request that doesn't resolve to a tenant subdomain.
const ProductDefault = mongoose.model('Product', productSchema);

// Per-tenant-connection resolver. Each mongoose Connection keeps its own model
// registry, so registering 'Product' on a tenant connection never collides with
// the default connection's registration (OverwriteModelError only happens when
// re-registering on the SAME connection).
function getProductModel(conn) {
  if (!conn) return ProductDefault;
  return conn.models.Product || conn.model('Product', productSchema);
}

module.exports = ProductDefault;
module.exports.getProductModel = getProductModel;
