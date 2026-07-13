const mongoose = require('mongoose');

const cartItemSchema = new mongoose.Schema({
  product:  { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  quantity: { type: Number, required: true, min: 1, default: 1 },
}, { _id: false });

const cartSchema = new mongoose.Schema({
  customer: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true, unique: true },
  items:    [cartItemSchema],
  // Touched whenever items change — the abandoned-cart recovery job reads
  // this instead of Order.status proxies, since a cart can be abandoned
  // long before an order is ever created.
  lastActivityAt: { type: Date, default: Date.now },
  // Set once a reminder email has gone out, so the job never re-sends for
  // the same abandonment. Cleared back to null whenever items change again
  // (a fresh add-to-cart after a reminder is a new abandonment window).
  reminderSentAt: { type: Date, default: null },
}, { timestamps: true });

cartSchema.pre('save', function (next) {
  if (this.isModified('items')) {
    this.lastActivityAt = new Date();
    this.reminderSentAt = null;
  }
  next();
});

cartSchema.index({ lastActivityAt: 1, reminderSentAt: 1 });

// Default-connection model — the single shared `ecom.Cart` collection,
// preserved for any request that doesn't resolve to a tenant subdomain.
const CartDefault = mongoose.model('Cart', cartSchema);

// Per-tenant-connection resolver. Each mongoose Connection keeps its own model
// registry, so registering 'Cart' on a tenant connection never collides with
// the default connection's registration (OverwriteModelError only happens when
// re-registering on the SAME connection).
function getCartModel(conn) {
  if (!conn) return CartDefault;
  return conn.models.Cart || conn.model('Cart', cartSchema);
}

module.exports = CartDefault;
module.exports.getCartModel = getCartModel;
