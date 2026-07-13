const { getSponsoredSlotModel } = require('../models/SponsoredSlot');

// ─── Admin CRUD ────────────────────────────────────────────────────────────────

exports.list = async (req, res, next) => {
  try {
    const SponsoredSlot = getSponsoredSlotModel(req.tenantConn);
    const slots = await SponsoredSlot.find()
      .sort({ position: 1, createdAt: -1 })
      .populate('product', 'name sku price discountPrice images vendor')
      .populate({ path: 'product', populate: { path: 'vendor', select: 'storeName' } });
    res.json({ success: true, data: slots });
  } catch (err) { next(err); }
};

exports.create = async (req, res, next) => {
  try {
    const SponsoredSlot = getSponsoredSlotModel(req.tenantConn);
    const slot = await SponsoredSlot.create(req.body);
    res.status(201).json({ success: true, data: slot });
  } catch (err) { next(err); }
};

exports.update = async (req, res, next) => {
  try {
    const SponsoredSlot = getSponsoredSlotModel(req.tenantConn);
    const slot = await SponsoredSlot.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!slot) return res.status(404).json({ success: false, message: 'Sponsored slot not found' });
    res.json({ success: true, data: slot });
  } catch (err) { next(err); }
};

exports.remove = async (req, res, next) => {
  try {
    const SponsoredSlot = getSponsoredSlotModel(req.tenantConn);
    const slot = await SponsoredSlot.findByIdAndDelete(req.params.id);
    if (!slot) return res.status(404).json({ success: false, message: 'Sponsored slot not found' });
    res.json({ success: true, message: 'Sponsored slot removed' });
  } catch (err) { next(err); }
};

exports.toggle = async (req, res, next) => {
  try {
    const SponsoredSlot = getSponsoredSlotModel(req.tenantConn);
    const slot = await SponsoredSlot.findById(req.params.id);
    if (!slot) return res.status(404).json({ success: false, message: 'Sponsored slot not found' });
    slot.isActive = !slot.isActive;
    await slot.save();
    res.json({ success: true, data: slot });
  } catch (err) { next(err); }
};

// ─── Storefront: public active slots ─────────────────────────────────────────

exports.getActiveSlots = async (req, res, next) => {
  try {
    const SponsoredSlot = getSponsoredSlotModel(req.tenantConn);
    const now = new Date();
    const slots = await SponsoredSlot.find({
      isActive: true,
      $and: [
        { $or: [{ startsAt: null }, { startsAt: { $lte: now } }] },
        { $or: [{ endsAt:   null }, { endsAt:   { $gte: now } }] },
      ],
    })
      .sort({ position: 1, createdAt: -1 })
      .populate('product', 'name slug price discountPrice images stock status')
      .lean();

    // Filter out slots whose product is no longer active/purchasable —
    // the admin curated a placement, not a permanent guarantee if the
    // underlying product gets unpublished later.
    const data = slots.filter(s => s.product && s.product.status === 'active');
    res.json({ success: true, data });
  } catch (err) { next(err); }
};
