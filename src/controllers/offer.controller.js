const Offer   = require('../models/Offer');
const Product = require('../models/Product');

// ─── Admin CRUD ───────────────────────────────────────────────────────────────

exports.list = async (req, res, next) => {
  try {
    const filter = {};
    if (req.query.type)     filter.type     = req.query.type;
    if (req.query.isActive) filter.isActive = req.query.isActive === 'true';
    const offers = await Offer.find(filter).sort({ sortOrder: 1, createdAt: -1 });
    res.json({ success: true, data: offers });
  } catch (err) { next(err); }
};

exports.getOne = async (req, res, next) => {
  try {
    const offer = await Offer.findById(req.params.id)
      .populate('products',   'name sku price images')
      .populate('categories', 'name');
    if (!offer) return res.status(404).json({ success: false, message: 'Offer not found' });
    res.json({ success: true, data: offer });
  } catch (err) { next(err); }
};

exports.create = async (req, res, next) => {
  try {
    const offer = await Offer.create(req.body);
    res.status(201).json({ success: true, data: offer });
  } catch (err) { next(err); }
};

exports.update = async (req, res, next) => {
  try {
    const offer = await Offer.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!offer) return res.status(404).json({ success: false, message: 'Offer not found' });
    res.json({ success: true, data: offer });
  } catch (err) { next(err); }
};

exports.remove = async (req, res, next) => {
  try {
    const offer = await Offer.findByIdAndDelete(req.params.id);
    if (!offer) return res.status(404).json({ success: false, message: 'Offer not found' });
    res.json({ success: true, message: 'Offer deleted' });
  } catch (err) { next(err); }
};

exports.toggle = async (req, res, next) => {
  try {
    const offer = await Offer.findById(req.params.id);
    if (!offer) return res.status(404).json({ success: false, message: 'Offer not found' });
    offer.isActive = !offer.isActive;
    await offer.save();
    res.json({ success: true, data: offer });
  } catch (err) { next(err); }
};

exports.getStats = async (req, res, next) => {
  try {
    const [total, active, byType] = await Promise.all([
      Offer.countDocuments(),
      Offer.countDocuments({ isActive: true }),
      Offer.aggregate([
        { $group: { _id: '$type', count: { $sum: 1 }, active: { $sum: { $cond: ['$isActive', 1, 0] } } } },
      ]),
    ]);
    const typeMap = {};
    byType.forEach(t => { typeMap[t._id] = { count: t.count, active: t.active }; });
    res.json({ success: true, data: { total, active, byType: typeMap } });
  } catch (err) { next(err); }
};

// ─── Storefront: single public offer by ID ───────────────────────────────────

exports.getActiveOffer = async (req, res, next) => {
  try {
    const now = new Date();
    const offer = await Offer.findOne({
      _id:       req.params.id,
      isActive:  true,
      platforms: { $in: ['both', 'web'] },
      $and: [
        { $or: [{ startsAt: null }, { startsAt: { $lte: now } }] },
        { $or: [{ endsAt:   null }, { endsAt:   { $gte: now } }] },
      ],
    });
    if (!offer) return res.status(404).json({ success: false, message: 'Offer not found or inactive' });
    res.json({ success: true, data: offer });
  } catch (err) { next(err); }
};

// ─── Storefront: public active offers ────────────────────────────────────────

exports.getActiveOffers = async (req, res, next) => {
  try {
    const now = new Date();
    const offers = await Offer.find({
      isActive:  true,
      platforms: { $in: ['both', 'web'] },
      $and: [
        { $or: [{ startsAt: null }, { startsAt: { $lte: now } }] },
        { $or: [{ endsAt:   null }, { endsAt:   { $gte: now } }] },
      ],
    })
      .sort({ sortOrder: 1, createdAt: -1 })
      .populate('products',   'name slug price discountPrice images')
      .populate('categories', 'name slug');
    res.json({ success: true, data: offers });
  } catch (err) { next(err); }
};

// ─── Storefront: calculate offer discount for cart ────────────────────────────
// Input:  { items: [{ productId, categoryId, price, quantity }] }
// Output: { appliedOffers: [...], totalDiscount }

exports.calculateOfferDiscount = async (req, res, next) => {
  try {
    const { items } = req.body;
    if (!items?.length) {
      return res.json({ success: true, data: { appliedOffers: [], totalDiscount: 0 } });
    }

    const now = new Date();
    const offers = await Offer.find({
      isActive:  true,
      type:      { $in: ['buy_x_get_y', 'bundle'] },
      platforms: { $in: ['both', 'web'] },
      $and: [
        { $or: [{ startsAt: null }, { startsAt: { $lte: now } }] },
        { $or: [{ endsAt:   null }, { endsAt:   { $gte: now } }] },
      ],
    });

    const appliedOffers = [];

    for (const offer of offers) {
      let applicable = items;

      if (offer.applicableTo === 'specific_products') {
        const ids = offer.products.map(p => p.toString());
        applicable = items.filter(i => ids.includes(i.productId?.toString()));
      } else if (offer.applicableTo === 'specific_categories') {
        const ids = offer.categories.map(c => c.toString());
        applicable = items.filter(i => i.categoryId && ids.includes(i.categoryId?.toString()));
      }

      if (!applicable.length) continue;

      // Expand to individual price units
      const units = [];
      applicable.forEach(item => {
        for (let q = 0; q < item.quantity; q++) units.push(Number(item.price));
      });

      if (offer.type === 'buy_x_get_y') {
        if (!offer.buyQty || !offer.getQty || units.length < offer.buyQty + offer.getQty) continue;
        // Sort descending so most expensive items are paid, cheapest get free
        units.sort((a, b) => b - a);
        const groupSize = offer.buyQty + offer.getQty;
        let discount = 0;
        for (let i = 0; i < units.length; i++) {
          if (i % groupSize >= offer.buyQty) discount += units[i];
        }
        if (discount > 0) {
          appliedOffers.push({
            offerId:     offer._id,
            type:        offer.type,
            title:       offer.title,
            badge:       offer.badge || 'FREE',
            discount:    Math.round(discount),
            description: `Buy ${offer.buyQty} Get ${offer.getQty} Free`,
          });
        }
      }

      if (offer.type === 'bundle') {
        if (!offer.bundleCount || !offer.bundlePrice || units.length < offer.bundleCount) continue;
        units.sort((a, b) => b - a);
        const bundles = Math.floor(units.length / offer.bundleCount);
        let discount = 0;
        for (let b = 0; b < bundles; b++) {
          const slice      = units.slice(b * offer.bundleCount, (b + 1) * offer.bundleCount);
          const sliceTotal = slice.reduce((s, p) => s + p, 0);
          const d = sliceTotal - offer.bundlePrice;
          if (d > 0) discount += d;
        }
        if (discount > 0) {
          appliedOffers.push({
            offerId:     offer._id,
            type:        offer.type,
            title:       offer.title,
            badge:       offer.badge || 'BUNDLE',
            discount:    Math.round(discount),
            description: `Get ${offer.bundleCount} for ₹${offer.bundlePrice}`,
          });
        }
      }
    }

    const totalDiscount = appliedOffers.reduce((s, o) => s + o.discount, 0);
    res.json({ success: true, data: { appliedOffers, totalDiscount } });
  } catch (err) { next(err); }
};
