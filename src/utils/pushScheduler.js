const webpush          = require('web-push');
const PushNotification = require('../models/PushNotification');
const Customer         = require('../models/Customer');

async function processScheduledNotifications() {
  const due = await PushNotification.find({
    status: 'scheduled',
    scheduledAt: { $lte: new Date() },
  });

  if (due.length === 0) return;

  if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) return;

  webpush.setVapidDetails(
    `mailto:${process.env.VAPID_EMAIL || 'admin@example.com'}`,
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );

  for (const notification of due) {
    try {
      const recipients = await Customer.find({
        webPushSubscription: { $ne: null },
        status: 'active',
      }).select('_id webPushSubscription').lean();

      const payload = JSON.stringify({
        title:           notification.title,
        body:            notification.body,
        imageUrl:        notification.imageUrl,
        deepLink:        notification.deepLink,
        deepLinkTarget:  notification.deepLinkTarget,
      });

      const results = await Promise.allSettled(
        recipients.map(r => webpush.sendNotification(r.webPushSubscription, payload))
      );

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
      await PushNotification.findByIdAndUpdate(notification._id, {
        status: 'sent',
        sentAt: new Date(),
        sentCount,
      });
    } catch {
      await PushNotification.findByIdAndUpdate(notification._id, { status: 'failed' });
    }
  }
}

function startPushScheduler() {
  setInterval(processScheduledNotifications, 60 * 1000);
}

module.exports = { startPushScheduler };
