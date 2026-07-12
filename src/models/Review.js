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

// Default-connection model — the single shared `ecom.Review` collection,
// preserved for any request that doesn't resolve to a tenant subdomain.
const ReviewDefault = mongoose.model('Review', reviewSchema);

// Per-tenant-connection resolver. Each mongoose Connection keeps its own model
// registry, so registering 'Review' on a tenant connection never collides with
// the default connection's registration (OverwriteModelError only happens when
// re-registering on the SAME connection).
function getReviewModel(conn) {
  if (!conn) return ReviewDefault;
  return conn.models.Review || conn.model('Review', reviewSchema);
}

module.exports = ReviewDefault;
module.exports.getReviewModel = getReviewModel;
