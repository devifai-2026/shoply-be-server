const AdminNotification = require('../models/AdminNotification');

exports.list = async (req, res, next) => {
  try {
    const limit = parseInt(req.query.limit) || 30;
    const page  = Math.max(1, parseInt(req.query.page) || 1);
    const skip  = (page - 1) * limit;
    const filter = {};
    if (req.query.type)   filter.type   = req.query.type;
    if (req.query.unread === 'true') filter.isRead = false;

    const [notifications, total, unreadCount] = await Promise.all([
      AdminNotification.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
      AdminNotification.countDocuments(filter),
      AdminNotification.countDocuments({ isRead: false }),
    ]);

    res.json({ success: true, data: notifications, pagination: { page, limit, total }, unreadCount });
  } catch (err) { next(err); }
};

exports.markRead = async (req, res, next) => {
  try {
    const notification = await AdminNotification.findByIdAndUpdate(req.params.id, { isRead: true }, { new: true });
    if (!notification) return res.status(404).json({ success: false, message: 'Notification not found' });
    res.json({ success: true, data: notification });
  } catch (err) { next(err); }
};

exports.markAllRead = async (req, res, next) => {
  try {
    await AdminNotification.updateMany({ isRead: false }, { isRead: true });
    res.json({ success: true, message: 'All notifications marked as read' });
  } catch (err) { next(err); }
};

exports.remove = async (req, res, next) => {
  try {
    await AdminNotification.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'Notification deleted' });
  } catch (err) { next(err); }
};

exports.clearAll = async (req, res, next) => {
  try {
    await AdminNotification.deleteMany({ isRead: true });
    res.json({ success: true, message: 'Read notifications cleared' });
  } catch (err) { next(err); }
};
