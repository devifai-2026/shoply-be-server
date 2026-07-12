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

module.exports = mongoose.model('Brand', brandSchema);
