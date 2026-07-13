const mongoose = require('mongoose');

// Embedded ledger — every balance change is an auditable entry, not just a
// running number. `balance` is a derived cache updated alongside each push,
// so reads don't need to re-sum the whole ledger every time.
const walletTransactionSchema = new mongoose.Schema({
  amount:    { type: Number, required: true }, // always positive; `type` says the direction
  type:      { type: String, enum: ['credit', 'debit'], required: true },
  reason:    { type: String, required: true }, // e.g. "Refund for order ORD-...", "Used at checkout"
  orderRef:  { type: mongoose.Schema.Types.ObjectId, ref: 'Order', default: null },
  createdAt: { type: Date, default: Date.now },
}, { _id: true });

const walletSchema = new mongoose.Schema({
  customer:     { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true, unique: true },
  balance:      { type: Number, default: 0, min: 0 },
  transactions: [walletTransactionSchema],
}, { timestamps: true });

// Default-connection model — the single shared `ecom.Wallet` collection,
// preserved for any request that doesn't resolve to a tenant subdomain.
const WalletDefault = mongoose.model('Wallet', walletSchema);

// Per-tenant-connection resolver. Each mongoose Connection keeps its own model
// registry, so registering 'Wallet' on a tenant connection never collides
// with the default connection's registration.
function getWalletModel(conn) {
  if (!conn) return WalletDefault;
  return conn.models.Wallet || conn.model('Wallet', walletSchema);
}

module.exports = WalletDefault;
module.exports.getWalletModel = getWalletModel;
