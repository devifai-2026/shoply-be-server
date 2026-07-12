const { getAppearanceModel } = require('../models/Appearance');

const getOrCreate = (Appearance) =>
  Appearance.findOneAndUpdate({ storeId: 'default' }, { $setOnInsert: { storeId: 'default' } }, { upsert: true, new: true });

exports.get = async (req, res, next) => {
  try {
    const Appearance = getAppearanceModel(req.tenantConn);
    const appearance = await getOrCreate(Appearance);
    res.json({ success: true, data: appearance });
  } catch (err) { next(err); }
};

const updateSection = (section) => async (req, res, next) => {
  try {
    const Appearance = getAppearanceModel(req.tenantConn);
    const update = { [section]: req.body };
    const appearance = await Appearance.findOneAndUpdate(
      { storeId: 'default' },
      { $set: update },
      { new: true, upsert: true, runValidators: true }
    );
    res.json({ success: true, data: appearance });
  } catch (err) { next(err); }
};

// Colors accepts either a flat body ({ primary, bg, ... }) for backward
// compatibility, or a structured body ({ colors: {...}, darkColors: {...} }).
// Any subset of keys is persisted for either variant via dotted $set paths so
// unspecified tokens keep their existing DB values.
exports.updateColors = async (req, res, next) => {
  try {
    const Appearance = getAppearanceModel(req.tenantConn);
    const body = req.body || {};
    const hasStructured = body.colors || body.darkColors;
    const lightColors = hasStructured ? (body.colors || {}) : body;
    const darkColors  = hasStructured ? (body.darkColors || {}) : {};

    const update = {};
    for (const [k, v] of Object.entries(lightColors)) update[`colors.${k}`] = v;
    for (const [k, v] of Object.entries(darkColors))  update[`darkColors.${k}`] = v;

    const appearance = await Appearance.findOneAndUpdate(
      { storeId: 'default' },
      Object.keys(update).length ? { $set: update } : { $setOnInsert: { storeId: 'default' } },
      { new: true, upsert: true, runValidators: true }
    );
    res.json({ success: true, data: appearance });
  } catch (err) { next(err); }
};

exports.updateTypography      = updateSection('typography');
exports.updateLayout          = updateSection('layout');
exports.updateSections        = updateSection('homepageSections');
exports.updateHeader          = updateSection('header');
exports.updateFooter          = updateSection('footer');
exports.updateCustomCSS       = updateSection('customCSS');
exports.updateHomepageContent = updateSection('homepageContent');

exports.updateCardStyle = async (req, res, next) => {
  try {
    const Appearance = getAppearanceModel(req.tenantConn);
    const appearance = await Appearance.findOneAndUpdate(
      { storeId: 'default' },
      { $set: { productCardStyle: req.body.style } },
      { new: true, upsert: true }
    );
    res.json({ success: true, data: appearance });
  } catch (err) { next(err); }
};

exports.uploadLogo = async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded' });
    const Appearance = getAppearanceModel(req.tenantConn);
    const url = `/uploads/branding/${req.file.filename}`;
    const appearance = await Appearance.findOneAndUpdate(
      { storeId: 'default' },
      { logo: url },
      { new: true, upsert: true }
    );
    res.json({ success: true, data: { logo: url }, appearance });
  } catch (err) { next(err); }
};

exports.uploadFavicon = async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded' });
    const Appearance = getAppearanceModel(req.tenantConn);
    const url = `/uploads/branding/${req.file.filename}`;
    const appearance = await Appearance.findOneAndUpdate(
      { storeId: 'default' },
      { favicon: url },
      { new: true, upsert: true }
    );
    res.json({ success: true, data: { favicon: url }, appearance });
  } catch (err) { next(err); }
};

exports.uploadAppIcon = async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded' });
    const Appearance = getAppearanceModel(req.tenantConn);
    const url = `/uploads/branding/${req.file.filename}`;
    const appearance = await Appearance.findOneAndUpdate(
      { storeId: 'default' },
      { appIcon: url },
      { new: true, upsert: true }
    );
    res.json({ success: true, data: { appIcon: url }, appearance });
  } catch (err) { next(err); }
};

exports.uploadBannerImage = async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded' });
    const index = parseInt(req.params.index, 10);
    if (isNaN(index) || index < 0 || index > 4)
      return res.status(400).json({ success: false, message: 'Invalid banner index (0–4)' });
    const Appearance = getAppearanceModel(req.tenantConn);
    const url = `/uploads/banners/${req.file.filename}`;
    const appearance = await Appearance.findOneAndUpdate(
      { storeId: 'default' },
      { $set: { [`homepageContent.promoBanners.${index}.image`]: url } },
      { new: true, upsert: true }
    );
    res.json({ success: true, data: { image: url }, appearance });
  } catch (err) { next(err); }
};
