const mongoose = require('mongoose');

const reviewSchema = new mongoose.Schema({
  product:   { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  customer:  { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true },
  order:     { type: mongoose.Schema.Types.ObjectId, ref: 'Order', default: null },
  rating:    { type: Number, required: true, min: 1, max: 5 },
  title:     { type: String, default: '' },
  content:   { type: String, required: true },
  images:    [{ type: String }],
  status:    { type: String, enum: ['pending', 'approved', 'rejected', 'reported'], default: 'pending' },
  adminReply: { type: String, default: null },
  isVerifiedPurchase: { type: Boolean, default: false },
  helpfulCount: { type: Number, default: 0 },
  reportReason: { type: String, default: null },
}, { timestamps: true });

reviewSchema.index({ product: 1, status: 1 });
reviewSchema.index({ customer: 1 });
reviewSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model('Review', reviewSchema);
