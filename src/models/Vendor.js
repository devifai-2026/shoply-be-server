const mongoose = require('mongoose');
const bcrypt   = require('bcryptjs');

const vendorSchema = new mongoose.Schema({
  name:        { type: String, required: true, trim: true },
  email:       { type: String, required: true, unique: true, lowercase: true, trim: true },
  phone:       { type: String, default: '' },
  password:    { type: String, required: true, select: false },

  storeName:   { type: String, required: true, trim: true },
  slug:        { type: String, required: true, unique: true, lowercase: true },
  description: { type: String, default: '' },
  logo:        { type: String, default: null },
  banner:      { type: String, default: null },

  // KYC
  gstin: { type: String, default: '', trim: true, uppercase: true },
  pan:   { type: String, default: '', trim: true, uppercase: true },
  bankDetails: {
    accountName:   { type: String, default: '' },
    accountNumber: { type: String, default: '' },
    ifsc:          { type: String, default: '' },
    bankName:      { type: String, default: '' },
  },
  pickupAddress: {
    line1:   { type: String, default: '' },
    line2:   { type: String, default: '' },
    city:    { type: String, default: '' },
    state:   { type: String, default: '' },
    pincode: { type: String, default: '' },
    country: { type: String, default: 'India' },
    phone:   { type: String, default: '' },
  },
  // Must exactly match a pickup location name already registered in the
  // platform's Shiprocket panel (Shiprocket has no API to register one
  // inline) — until set, this vendor's shipments are blocked, not
  // soft-defaulted to a shared address.
  shiprocketPickupLocation: { type: String, default: '' },

  // Per-vendor shipping override — when disabled, falls back to the store's
  // global ShippingZone table (see pricing.service.computeShipping).
  shippingSettings: {
    useCustomRates: { type: Boolean, default: false },
    flatRate:       { type: Number, default: 0, min: 0 },
    freeAbove:      { type: Number, default: null, min: 0 }, // null = no vendor-specific free-shipping threshold
  },

  // Whether this vendor's GSTIN + a GST line item are shown on invoices for
  // their sub-orders. GST rate itself still comes from Product.gstRate /
  // StoreSettings.orders.gstRate — this only toggles visibility/inclusion.
  gstEnabled: { type: Boolean, default: true },

  // Marketplace terms
  commissionRate: { type: Number, default: 0, min: 0, max: 100 }, // % of item subtotal
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected', 'suspended'],
    default: 'pending',
  },
  statusNote: { type: String, default: '' }, // rejection/suspension reason

  rating:     { type: Number, default: 0 },
  totalSales: { type: Number, default: 0 }, // lifetime gross merchandise value
  totalWithdrawn: { type: Number, default: 0 }, // lifetime amount paid out via withdrawal requests

  // Admin-only trust toggle — this vendor's new products skip the manual/AI
  // moderation queue and publish immediately. Vendor cannot set this
  // themselves (not in vendorAuth's own-profile update whitelist).
  autoApprove: { type: Boolean, default: false },
}, { timestamps: true });

vendorSchema.index({ status: 1 });
vendorSchema.index({ storeName: 'text', name: 'text', email: 'text' });

vendorSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

vendorSchema.methods.matchPassword = function (entered) {
  return bcrypt.compare(entered, this.password);
};

// Default-connection model — the single shared `ecom.Vendor` collection,
// preserved for any request that doesn't resolve to a tenant subdomain.
const VendorDefault = mongoose.model('Vendor', vendorSchema);

// Per-tenant-connection resolver. Each mongoose Connection keeps its own model
// registry, so registering 'Vendor' on a tenant connection never collides with
// the default connection's registration (OverwriteModelError only happens when
// re-registering on the SAME connection).
function getVendorModel(conn) {
  if (!conn) return VendorDefault;
  return conn.models.Vendor || conn.model('Vendor', vendorSchema);
}

module.exports = VendorDefault;
module.exports.getVendorModel = getVendorModel;
