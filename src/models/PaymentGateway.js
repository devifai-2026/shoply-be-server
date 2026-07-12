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

module.exports = mongoose.model('PaymentGateway', paymentGatewaySchema);
