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
  shippingCost:     { type: Number, default: 0 }, // this vendor's proportional share of Order.shippingCost
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

// Default-connection model — the single shared `ecom.SubOrder` collection,
// preserved for any request that doesn't resolve to a tenant subdomain.
const SubOrderDefault = mongoose.model('SubOrder', subOrderSchema);

// Per-tenant-connection resolver. Each mongoose Connection keeps its own model
// registry, so registering 'SubOrder' on a tenant connection never collides with
// the default connection's registration (OverwriteModelError only happens when
// re-registering on the SAME connection).
function getSubOrderModel(conn) {
  if (!conn) return SubOrderDefault;
  return conn.models.SubOrder || conn.model('SubOrder', subOrderSchema);
}

module.exports = SubOrderDefault;
module.exports.getSubOrderModel = getSubOrderModel;
