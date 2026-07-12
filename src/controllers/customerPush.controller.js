const Customer = require('../models/Customer');

exports.getVapidKey = (req, res) => {
  res.json({ success: true, publicKey: process.env.VAPID_PUBLIC_KEY });
};

exports.subscribe = async (req, res, next) => {
  try {
    const { subscription } = req.body;
    if (!subscription?.endpoint) {
      return res.status(400).json({ success: false, message: 'Invalid subscription object' });
    }
    await Customer.findByIdAndUpdate(req.customer._id, {
      webPushSubscription: subscription,
      deviceType: 'web',
    });
    res.json({ success: true });
  } catch (err) { next(err); }
};

exports.unsubscribe = async (req, res, next) => {
  try {
    await Customer.findByIdAndUpdate(req.customer._id, {
      webPushSubscription: null,
      deviceType: null,
    });
    res.json({ success: true });
  } catch (err) { next(err); }
};
