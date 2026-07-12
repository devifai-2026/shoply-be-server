const mongoose = require('mongoose');

// One per vendor per parent order. Store-owned items (product.vendor = null)
// don't get a sub-order; they're fulfilled by the store itself.
const subOrderSchema = new mongoose.Schema({
  order:       { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true },
  orderNumber: { type: String, required: true },            // parent's number
  subNumber:   { type: String, required: true, unique: true }, // e.g. ORD-...-V1
  vendor:      { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor', required: true },

  items: [{
    product:    { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
    name:       String,
    sku:        String,
    image:      String,
    quantity:   Number,
    price:      Number,
    attributes: { type: Map, of: String, default: {} },
  }],

  subtotal:         { type: Number, required: true },
  commissionRate:   { type: Number, required: true }, // % snapshot at order time
  commissionAmount: { type: Number, required: true },
  vendorEarning:    { type: Number, required: true }, // subtotal - commission

  status: {
    type: String,
    enum: ['pending', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded'],
    default: 'pending',
  },

  // Per-vendor fulfillment (each vendor ships its own parcel)
  trackingNumber: { type: String, default: null },
  courierName:    { type: String, default: null },
  courierSlug:    { type: String, default: null },
  shipmentId:     { type: String, default: null },
  awbCode:        { type: String, default: null },

  timeline: [{
    status:    String,
    note:      String,
    createdAt: { type: Date, default: Date.now },
  }],

  settledAt: { type: Date, default: null }, // payout settlement marker
}, { timestamps: true });

subOrderSchema.index({ vendor: 1, status: 1, createdAt: -1 });
subOrderSchema.index({ order: 1 });

module.exports = mongoose.model('SubOrder', subOrderSchema);
