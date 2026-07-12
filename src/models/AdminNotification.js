const mongoose = require('mongoose');

const adminNotificationSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['order', 'review', 'low_stock', 'customer', 'payment', 'system', 'vendor', 'shipping_blocked', 'withdrawal'],
    required: true,
  },
  title:    { type: String, required: true },
  message:  { type: String, required: true },
  link:     { type: String, default: null },
  isRead:   { type: Boolean, default: false },
  meta:     { type: Map, of: String, default: {} },
}, { timestamps: true });

adminNotificationSchema.index({ isRead: 1, createdAt: -1 });

// Default-connection model — the single shared `ecom.AdminNotification` collection,
// preserved for any request that doesn't resolve to a tenant subdomain.
const AdminNotificationDefault = mongoose.model('AdminNotification', adminNotificationSchema);

// Per-tenant-connection resolver. Each mongoose Connection keeps its own model
// registry, so registering 'AdminNotification' on a tenant connection never collides with
// the default connection's registration (OverwriteModelError only happens when
// re-registering on the SAME connection).
function getAdminNotificationModel(conn) {
  if (!conn) return AdminNotificationDefault;
  return conn.models.AdminNotification || conn.model('AdminNotification', adminNotificationSchema);
}

module.exports = AdminNotificationDefault;
module.exports.getAdminNotificationModel = getAdminNotificationModel;
