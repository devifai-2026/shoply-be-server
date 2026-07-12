const Coupon = require('../models/Coupon');

exports.list = async (req, res, next) => {
  try {
    const filter = {};
    if (req.query.status) filter.status = req.query.status;
    const coupons = await Coupon.find(filter).sort({ createdAt: -1 });
    res.json({ success: true, data: coupons });
  } catch (err) { next(err); }
};

exports.getOne = async (req, res, next) => {
  try {
    const coupon = await Coupon.findById(req.params.id)
      .populate('products', 'name sku')
      .populate('categories', 'name');
    if (!coupon) return res.status(404).json({ success: false, message: 'Coupon not found' });
    res.json({ success: true, data: coupon });
  } catch (err) { next(err); }
};

exports.create = async (req, res, next) => {
  try {
    const coupon = await Coupon.create(req.body);
    res.status(201).json({ success: true, data: coupon });
  } catch (err) { next(err); }
};

exports.update = async (req, res, next) => {
  try {
    const coupon = await Coupon.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!coupon) return res.status(404).json({ success: false, message: 'Coupon not found' });
    res.json({ success: true, data: coupon });
  } catch (err) { next(err); }
};

exports.remove = async (req, res, next) => {
  try {
    const coupon = await Coupon.findByIdAndDelete(req.params.id);
    if (!coupon) return res.status(404).json({ success: false, message: 'Coupon not found' });
    res.json({ success: true, message: 'Coupon deleted' });
  } catch (err) { next(err); }
};

exports.validate = async (req, res, next) => {
  try {
    const { code, orderTotal, platform } = req.body;
    const coupon = await Coupon.findOne({ code: code?.toUpperCase() });
    if (!coupon) return res.status(404).json({ success: false, message: 'Invalid coupon code' });

    const { valid, reason } = coupon.isValid(orderTotal, platform);
    if (!valid) return res.status(400).json({ success: false, message: reason });

    let discount = 0;
    if (coupon.discountType === 'percent') {
      discount = Math.round(orderTotal * (coupon.discountValue / 100));
      if (coupon.maxDiscount) discount = Math.min(discount, coupon.maxDiscount);
    } else {
      discount = coupon.discountValue;
    }

    res.json({ success: true, data: { coupon, discount, finalAmount: orderTotal - discount } });
  } catch (err) { next(err); }
};

exports.getStats = async (req, res, next) => {
  try {
    const [active, redeemedAgg, inactive, savingsAgg] = await Promise.all([
      Coupon.countDocuments({ status: 'active' }),
      Coupon.aggregate([{ $group: { _id: null, total: { $sum: '$usageCount' } } }]),
      Coupon.countDocuments({ status: 'inactive' }),
      Coupon.aggregate([
        { $match: { discountType: 'fixed' } },
        { $group: { _id: null, total: { $sum: { $multiply: ['$discountValue', '$usageCount'] } } } },
      ]),
    ]);
    res.json({
      success: true,
      data: {
        active,
        totalRedeemed: redeemedAgg[0]?.total || 0,
        inactive,
        totalSavings:  savingsAgg[0]?.total  || 0,
      },
    });
  } catch (err) { next(err); }
};
