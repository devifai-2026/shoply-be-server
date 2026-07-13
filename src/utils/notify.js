const { getAdminNotificationModel } = require('../models/AdminNotification');
const { emitToAdmin } = require('../socket');

// Wraps AdminNotification.create so every existing call site (withdrawals,
// vendor registration, shipping-blocked, etc.) also pushes a live
// notification:new event to the admin panel's socket, instead of only
// being visible on the next page load/poll. tenantSlug is required so the
// event lands in the right tenant's room (see socket.js).
async function notifyAdmin(tenantConn, tenantSlug, notification) {
  const AdminNotification = getAdminNotificationModel(tenantConn);
  const doc = await AdminNotification.create(notification);
  emitToAdmin(tenantSlug, 'notification:new', doc.toObject ? doc.toObject() : doc);
  return doc;
}

module.exports = { notifyAdmin };
