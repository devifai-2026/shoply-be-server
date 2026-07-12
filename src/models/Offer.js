const mongoose = require('mongoose');

const offerSchema = new mongoose.Schema({
  title:       { type: String, required: true, trim: true },
  description: { type: String, default: '' },
  type: {
    type: String,
    enum: ['buy_x_get_y', 'bundle', 'under_price'],
    required: true,
  },
  badge:       { type: String, default: '' },
  bannerImage: { type: String, default: null },

  // buy_x_get_y: buy buyQty items, get getQty items free
  buyQty: { type: Number, default: null },
  getQty: { type: Number, default: null },

  // bundle: get bundleCount products for bundlePrice total
  bundleCount: { type: Number, default: null },
  bundlePrice: { type: Number, default: null },

  // under_price: curated collection of products under maxPrice
  maxPrice: { type: Number, default: null },

  applicableTo: {
    type:    String,
    enum:    ['all', 'specific_products', 'specific_categories'],
    default: 'all',
  },
  products:   [{ type: mongoose.Schema.Types.ObjectId, ref: 'Product' }],
  categories: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Category' }],

  startsAt:  { type: Date,    default: null },
  endsAt:    { type: Date,    default: null },
  isActive:  { type: Boolean, default: false },
  platforms: { type: String,  enum: ['both', 'web', 'app'], default: 'both' },
  sortOrder: { type: Number,  default: 0 },
}, { timestamps: true });

offerSchema.virtual('isLive').get(function () {
  const now = new Date();
  if (!this.isActive) return false;
  if (this.startsAt && now < this.startsAt) return false;
  if (this.endsAt   && now > this.endsAt)   return false;
  return true;
});

offerSchema.index({ isActive: 1, type: 1 });

module.exports = mongoose.model('Offer', offerSchema);
