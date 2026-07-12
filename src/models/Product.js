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

module.exports = mongoose.model('Product', productSchema);
