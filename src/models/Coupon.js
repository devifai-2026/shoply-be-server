const mongoose = require('mongoose');

const couponSchema = new mongoose.Schema({
  code:          { type: String, required: true, unique: true, uppercase: true, trim: true },
  discountType:  { type: String, enum: ['percent', 'fixed'], required: true },
  discountValue: { type: Number, required: true, min: 0 },
  minOrderValue: { type: Number, default: 0 },
  maxDiscount:   { type: Number, default: null },
  platforms:     { type: String, enum: ['both', 'web', 'app'], default: 'both' },
  usageLimit:    { type: Number, default: null },
  usageCount:    { type: Number, default: 0 },
  perUserLimit:  { type: Number, default: 1 },
  startsAt:      { type: Date, default: null },
  expiresAt:     { type: Date, default: null },
  status:        { type: String, enum: ['active', 'inactive'], default: 'active' },
  description:   { type: String, default: '' },
  applicableTo:  {
    type: String,
    enum: ['all', 'specific_products', 'specific_categories'],
    default: 'all',
  },
  products:    [{ type: mongoose.Schema.Types.ObjectId, ref: 'Product' }],
  categories:  [{ type: mongoose.Schema.Types.ObjectId, ref: 'Category' }],
}, { timestamps: true });

couponSchema.methods.isValid = function (orderTotal, platform) {
  const now = new Date();
  if (this.status !== 'active') return { valid: false, reason: 'Coupon is inactive' };
  if (this.startsAt && now < this.startsAt) return { valid: false, reason: 'Coupon not started yet' };
  if (this.expiresAt && now > this.expiresAt) return { valid: false, reason: 'Coupon has expired' };
  if (this.usageLimit && this.usageCount >= this.usageLimit) return { valid: false, reason: 'Usage limit reached' };
  if (orderTotal < this.minOrderValue) return { valid: false, reason: `Minimum order value is ${this.minOrderValue}` };
  if (this.platforms !== 'both' && this.platforms !== platform.toLowerCase()) return { valid: false, reason: `Coupon not valid for ${platform}` };
  return { valid: true };
};

// Default-connection model — the single shared `ecom.Coupon` collection,
// preserved for any request that doesn't resolve to a tenant subdomain.
const CouponDefault = mongoose.model('Coupon', couponSchema);

// Per-tenant-connection resolver. Each mongoose Connection keeps its own model
// registry, so registering 'Coupon' on a tenant connection never collides with
// the default connection's registration (OverwriteModelError only happens when
// re-registering on the SAME connection).
function getCouponModel(conn) {
  if (!conn) return CouponDefault;
  return conn.models.Coupon || conn.model('Coupon', couponSchema);
}

module.exports = CouponDefault;
module.exports.getCouponModel = getCouponModel;
