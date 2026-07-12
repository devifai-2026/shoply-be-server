const mongoose = require('mongoose');

const withdrawalRequestSchema = new mongoose.Schema({
  vendor:           { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor', required: true },
  amount:           { type: Number, required: true, min: 1 },
  status:           { type: String, enum: ['pending', 'paid', 'rejected'], default: 'pending' },
  requestedAt:      { type: Date, default: Date.now },
  processedAt:      { type: Date, default: null },
  paymentReference: { type: String, default: '' },  // admin-entered, only present when status=paid
  screenshotUrl:    { type: String, default: null }, // admin-uploaded, only present when status=paid
  adminNote:        { type: String, default: '' },   // rejection reason
}, { timestamps: true });

withdrawalRequestSchema.index({ vendor: 1, status: 1, createdAt: -1 });
withdrawalRequestSchema.index({ status: 1, createdAt: -1 });

// Default-connection model — the single shared `ecom.WithdrawalRequest`
// collection, preserved for any request that doesn't resolve to a tenant subdomain.
const WithdrawalRequestDefault = mongoose.model('WithdrawalRequest', withdrawalRequestSchema);

// Per-tenant-connection resolver. Each mongoose Connection keeps its own model
// registry, so registering 'WithdrawalRequest' on a tenant connection never
// collides with the default connection's registration.
function getWithdrawalRequestModel(conn) {
  if (!conn) return WithdrawalRequestDefault;
  return conn.models.WithdrawalRequest || conn.model('WithdrawalRequest', withdrawalRequestSchema);
}

module.exports = WithdrawalRequestDefault;
module.exports.getWithdrawalRequestModel = getWithdrawalRequestModel;
