const mongoose = require('mongoose');

const pushNotificationSchema = new mongoose.Schema({
  title:      { type: String, required: true, trim: true },
  body:       { type: String, required: true },
  imageUrl:   { type: String, default: null },
  deepLink:   {
    type: String,
    enum: ['homepage', 'flash_sale', 'specific_product', 'category', 'custom'],
    default: 'homepage',
  },
  deepLinkTarget: { type: String, default: null },
  audience:   { type: String, default: 'all' },
  sentCount:  { type: Number, default: 0 },
  openedCount: { type: Number, default: 0 },
  status:     { type: String, enum: ['draft', 'sent', 'scheduled', 'failed'], default: 'draft' },
  scheduledAt: { type: Date, default: null },
  sentAt:     { type: Date, default: null },
}, { timestamps: true });

pushNotificationSchema.virtual('openRate').get(function () {
  if (!this.sentCount) return 0;
  return Math.round((this.openedCount / this.sentCount) * 100);
});

pushNotificationSchema.index({ status: 1, scheduledAt: 1 });

module.exports = mongoose.model('PushNotification', pushNotificationSchema);
