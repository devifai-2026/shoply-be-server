const StoreSettings = require('../models/StoreSettings');

const getOrCreate = () =>
  StoreSettings.findOneAndUpdate(
    { storeId: 'default' },
    { $setOnInsert: { storeId: 'default' } },
    { upsert: true, new: true }
  );

const getOrCreateWithSms = () =>
  StoreSettings.findOneAndUpdate(
    { storeId: 'default' },
    { $setOnInsert: { storeId: 'default' } },
    { upsert: true, new: true }
  ).select('+sms.customerId +sms.authToken');

exports.get = async (req, res, next) => {
  try {
    const settings = await getOrCreate();
    res.json({ success: true, data: settings });
  } catch (err) { next(err); }
};

const updateSection = (section) => async (req, res, next) => {
  try {
    const prefixed = Object.fromEntries(
      Object.entries(req.body).map(([k, v]) => [`${section}.${k}`, v])
    );
    const settings = await StoreSettings.findOneAndUpdate(
      { storeId: 'default' },
      { $set: prefixed },
      { new: true, upsert: true, runValidators: true }
    );
    res.json({ success: true, data: settings });
  } catch (err) { next(err); }
};

exports.updateGeneral     = updateSection('general');
exports.updateRegional    = updateSection('regional');
exports.updateOperational = updateSection('operational');
exports.updateSEO         = updateSection('seo');
exports.updateOrders      = updateSection('orders');
exports.updateSocial      = updateSection('social');
exports.updateShipping    = updateSection('shipping');
exports.updateReviews     = updateSection('reviews');

exports.getSms = async (req, res, next) => {
  try {
    const settings = await getOrCreateWithSms();
    const { customerId, authToken } = settings.sms || {};
    // Return masked values so frontend knows if set, but not the actual secrets
    res.json({
      success: true,
      data: {
        customerId: customerId || '',
        authToken:  authToken  ? '••••••••' : '',
        isConfigured: !!(customerId && authToken),
      },
    });
  } catch (err) { next(err); }
};

exports.updateSms = async (req, res, next) => {
  try {
    const { customerId, authToken } = req.body;
    const update = {};
    if (customerId !== undefined) update['sms.customerId'] = customerId.trim();
    if (authToken  !== undefined && authToken !== '••••••••') update['sms.authToken'] = authToken.trim();

    await StoreSettings.findOneAndUpdate(
      { storeId: 'default' },
      { $set: update },
      { upsert: true, runValidators: true }
    );
    res.json({ success: true, message: 'SMS configuration saved' });
  } catch (err) { next(err); }
};
