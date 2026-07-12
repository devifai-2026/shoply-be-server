const { getStoreSettingsModel } = require('../models/StoreSettings');

const getOrCreate = (StoreSettings) =>
  StoreSettings.findOneAndUpdate(
    { storeId: 'default' },
    { $setOnInsert: { storeId: 'default' } },
    { upsert: true, new: true }
  );

const getOrCreateWithSms = (StoreSettings) =>
  StoreSettings.findOneAndUpdate(
    { storeId: 'default' },
    { $setOnInsert: { storeId: 'default' } },
    { upsert: true, new: true }
  ).select('+sms.customerId +sms.authToken');

exports.get = async (req, res, next) => {
  try {
    const StoreSettings = getStoreSettingsModel(req.tenantConn);
    const settings = await getOrCreate(StoreSettings);
    res.json({ success: true, data: settings });
  } catch (err) { next(err); }
};

const updateSection = (section) => async (req, res, next) => {
  try {
    const StoreSettings = getStoreSettingsModel(req.tenantConn);
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
    const StoreSettings = getStoreSettingsModel(req.tenantConn);
    const settings = await getOrCreateWithSms(StoreSettings);
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
    const StoreSettings = getStoreSettingsModel(req.tenantConn);
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
