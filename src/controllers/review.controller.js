const Review        = require('../models/Review');
const Product       = require('../models/Product');
const StoreSettings = require('../models/StoreSettings');
const AdminNotification = require('../models/AdminNotification');

const recalcProductRating = async (productId) => {
  const result = await Review.aggregate([
    { $match: { product: productId, status: 'approved' } },
    { $group: { _id: null, avg: { $avg: '$rating' }, count: { $sum: 1 } } },
  ]);
  await Product.findByIdAndUpdate(productId, {
    rating:      result[0]?.avg || 0,
    reviewCount: result[0]?.count || 0,
  });
};

exports.list = async (req, res, next) => {
  try {
    const page   = Math.max(1, parseInt(req.query.page)  || 1);
    const limit  = Math.min(100, parseInt(req.query.limit) || 20);
    const skip   = (page - 1) * limit;
    const filter = {};
    if (req.query.status && req.query.status !== 'all') filter.status = req.query.status;
    if (req.query.product) filter.product = req.query.product;
    if (req.query.rating)  filter.rating  = parseInt(req.query.rating);

    const [reviews, total] = await Promise.all([
      Review.find(filter)
        .populate('product', 'name images')
        .populate('customer', 'name email')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Review.countDocuments(filter),
    ]);
    res.json({ success: true, data: reviews, pagination: { page, limit, total } });
  } catch (err) { next(err); }
};

exports.getOne = async (req, res, next) => {
  try {
    const review = await Review.findById(req.params.id)
      .populate('product', 'name images')
      .populate('customer', 'name email');
    if (!review) return res.status(404).json({ success: false, message: 'Review not found' });
    res.json({ success: true, data: review });
  } catch (err) { next(err); }
};

exports.create = async (req, res, next) => {
  try {
    const images = req.files ? req.files.map(f => `/uploads/reviews/${f.filename}`) : [];
    const settings = await StoreSettings.findOne({ storeId: 'default' }).select('reviews');
    const autoApprove = settings?.reviews?.autoApprove || false;

    const review = await Review.create({
      ...req.body,
      images,
      status: autoApprove ? 'approved' : 'pending',
    });

    if (autoApprove) await recalcProductRating(review.product);

    await AdminNotification.create({
      type:    'review',
      title:   'New Review Submitted',
      message: `${autoApprove ? 'Auto-approved' : 'Pending review'} for product ${review.product}`,
      link:    '/reviews',
    });

    res.status(201).json({ success: true, data: review });
  } catch (err) { next(err); }
};

exports.updateStatus = async (req, res, next) => {
  try {
    const { status, adminReply } = req.body;
    const validStatuses = ['pending', 'approved', 'rejected', 'reported'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status' });
    }
    const update = { status };
    if (adminReply !== undefined) update.adminReply = adminReply;

    const review = await Review.findByIdAndUpdate(req.params.id, update, { new: true });
    if (!review) return res.status(404).json({ success: false, message: 'Review not found' });

    await recalcProductRating(review.product);
    res.json({ success: true, data: review });
  } catch (err) { next(err); }
};

exports.remove = async (req, res, next) => {
  try {
    const review = await Review.findByIdAndDelete(req.params.id);
    if (!review) return res.status(404).json({ success: false, message: 'Review not found' });
    await recalcProductRating(review.product);
    res.json({ success: true, message: 'Review deleted' });
  } catch (err) { next(err); }
};

exports.getStats = async (req, res, next) => {
  try {
    const [total, pending, approved, reported, avgRating] = await Promise.all([
      Review.countDocuments(),
      Review.countDocuments({ status: 'pending' }),
      Review.countDocuments({ status: 'approved' }),
      Review.countDocuments({ status: 'reported' }),
      Review.aggregate([{ $group: { _id: null, avg: { $avg: '$rating' } } }]),
    ]);
    res.json({ success: true, data: { total, pending, approved, reported, avgRating: (avgRating[0]?.avg || 0).toFixed(1) } });
  } catch (err) { next(err); }
};

exports.getSettings = async (req, res, next) => {
  try {
    const settings = await StoreSettings.findOne({ storeId: 'default' }).select('reviews');
    res.json({ success: true, data: settings?.reviews || {} });
  } catch (err) { next(err); }
};

exports.updateSettings = async (req, res, next) => {
  try {
    const prefixed = Object.fromEntries(Object.entries(req.body).map(([k, v]) => [`reviews.${k}`, v]));
    await StoreSettings.findOneAndUpdate({ storeId: 'default' }, { $set: prefixed }, { upsert: true });
    res.json({ success: true, message: 'Review settings updated' });
  } catch (err) { next(err); }
};
