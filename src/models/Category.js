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

module.exports = mongoose.model('Category', categorySchema);
