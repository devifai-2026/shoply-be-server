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

// Default-connection model — the single shared `ecom.PushNotification` collection,
// preserved for any request that doesn't resolve to a tenant subdomain.
const PushNotificationDefault = mongoose.model('PushNotification', pushNotificationSchema);

// Per-tenant-connection resolver. Each mongoose Connection keeps its own model
// registry, so registering 'PushNotification' on a tenant connection never collides with
// the default connection's registration (OverwriteModelError only happens when
// re-registering on the SAME connection).
function getPushNotificationModel(conn) {
  if (!conn) return PushNotificationDefault;
  return conn.models.PushNotification || conn.model('PushNotification', pushNotificationSchema);
}

module.exports = PushNotificationDefault;
module.exports.getPushNotificationModel = getPushNotificationModel;
