const webpush          = require('web-push');
const PushNotification = require('../models/PushNotification');
const Customer         = require('../models/Customer');

function getWebpush() {
  if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
    throw new Error('VAPID keys not configured in .env');
  }
  webpush.setVapidDetails(
    `mailto:${process.env.VAPID_EMAIL || 'admin@example.com'}`,
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
  return webpush;
}

exports.list = async (req, res, next) => {
  try {
    const limit = parseInt(req.query.limit) || 20;
    const page  = Math.max(1, parseInt(req.query.page) || 1);
    const skip  = (page - 1) * limit;

    const [notifications, total] = await Promise.all([
      PushNotification.find().sort({ createdAt: -1 }).skip(skip).limit(limit),
      PushNotification.countDocuments(),
    ]);
    res.json({ success: true, data: notifications, pagination: { page, limit, total } });
  } catch (err) { next(err); }
};

exports.send = async (req, res, next) => {
  try {
    const { title, body, audience, deepLink, deepLinkTarget, imageUrl } = req.body;

    const filter = { webPushSubscription: { $ne: null }, status: 'active' };

    const recipients = await Customer.find(filter).select('_id webPushSubscription').lean();

    const payload = JSON.stringify({ title, body, imageUrl, deepLink, deepLinkTarget });

    const wp = getWebpush();
    const results = await Promise.allSettled(
      recipients.map(r => wp.sendNotification(r.webPushSubscription, payload))
    );

    // Clean up expired or invalid subscriptions
    const expiredIds = [];
    results.forEach((result, i) => {
      if (result.status === 'rejected' && [404, 410].includes(result.reason?.statusCode)) {
        expiredIds.push(recipients[i]._id);
      }
    });
    if (expiredIds.length > 0) {
      await Customer.updateMany(
        { _id: { $in: expiredIds } },
        { webPushSubscription: null, deviceType: null }
      );
    }

    const sentCount = results.filter(r => r.status === 'fulfilled').length;

    const notification = await PushNotification.create({
      title, body, imageUrl, deepLink, deepLinkTarget, audience,
      sentCount, status: 'sent', sentAt: new Date(),
    });

    res.status(201).json({ success: true, data: notification, message: `Notification sent to ${sentCount} devices` });
  } catch (err) { next(err); }
};

exports.schedule = async (req, res, next) => {
  try {
    const { title, body, audience, deepLink, deepLinkTarget, imageUrl, scheduledAt } = req.body;
    if (!scheduledAt || new Date(scheduledAt) <= new Date()) {
      return res.status(400).json({ success: false, message: 'Scheduled time must be in the future' });
    }
    const notification = await PushNotification.create({
      title, body, imageUrl, deepLink, deepLinkTarget, audience,
      status: 'scheduled', scheduledAt: new Date(scheduledAt),
    });
    res.status(201).json({ success: true, data: notification });
  } catch (err) { next(err); }
};

exports.getStats = async (req, res, next) => {
  try {
    const [subscriberCount, sentThisMonth, avgOpenRate] = await Promise.all([
      Customer.countDocuments({ webPushSubscription: { $ne: null }, status: 'active' }),
      PushNotification.countDocuments({
        status: 'sent',
        sentAt: { $gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1) },
      }),
      PushNotification.aggregate([
        { $match: { status: 'sent', sentCount: { $gt: 0 } } },
        { $group: { _id: null, avgRate: { $avg: { $divide: ['$openedCount', '$sentCount'] } } } },
      ]),
    ]);
    const openRate = avgOpenRate[0] ? Math.round(avgOpenRate[0].avgRate * 100) : 0;
    res.json({ success: true, data: { subscriberCount, sentThisMonth, avgOpenRate: openRate } });
  } catch (err) { next(err); }
};
