const mongoose = require('mongoose');

const fieldSchema = new mongoose.Schema({
  label:       { type: String, required: true },
  key:         { type: String, required: true },
  value:       { type: String, default: '', select: false },
  isSecret:    { type: Boolean, default: false },
  placeholder: { type: String, default: '' },
}, { _id: false });

const paymentGatewaySchema = new mongoose.Schema({
  slug:        { type: String, required: true, unique: true },
  name:        { type: String, required: true },
  type:        {
    type: String,
    enum: ['Manual', 'Aggregator', 'UPI Wallet', 'International'],
    required: true,
  },
  description: { type: String, default: '' },
  isActive:    { type: Boolean, default: false },
  sandboxMode: { type: Boolean, default: true },
  fields:      [fieldSchema],
  sortOrder:   { type: Number, default: 0 },
}, { timestamps: true });

// Default-connection model — the single shared `ecom.PaymentGateway` collection,
// preserved for any request that doesn't resolve to a tenant subdomain.
const PaymentGatewayDefault = mongoose.model('PaymentGateway', paymentGatewaySchema);

// Per-tenant-connection resolver. Each mongoose Connection keeps its own model
// registry, so registering 'PaymentGateway' on a tenant connection never collides with
// the default connection's registration (OverwriteModelError only happens when
// re-registering on the SAME connection).
function getPaymentGatewayModel(conn) {
  if (!conn) return PaymentGatewayDefault;
  return conn.models.PaymentGateway || conn.model('PaymentGateway', paymentGatewaySchema);
}

module.exports = PaymentGatewayDefault;
module.exports.getPaymentGatewayModel = getPaymentGatewayModel;
