const mongoose = require('mongoose');

const adminNotificationSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['order', 'review', 'low_stock', 'customer', 'payment', 'system', 'vendor'],
    required: true,
  },
  title:    { type: String, required: true },
  message:  { type: String, required: true },
  link:     { type: String, default: null },
  isRead:   { type: Boolean, default: false },
  meta:     { type: Map, of: String, default: {} },
}, { timestamps: true });

adminNotificationSchema.index({ isRead: 1, createdAt: -1 });

module.exports = mongoose.model('AdminNotification', adminNotificationSchema);
