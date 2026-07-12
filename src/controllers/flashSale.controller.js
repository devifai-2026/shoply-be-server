const FlashSale = require('../models/FlashSale');
const Product   = require('../models/Product');

exports.list = async (req, res, next) => {
  try {
    const sales = await FlashSale.find()
      .populate('products.product', 'name sku images price')
      .sort({ createdAt: -1 });
    res.json({ success: true, data: sales });
  } catch (err) { next(err); }
};

exports.getActive = async (req, res, next) => {
  try {
    const now  = new Date();
    const sale = await FlashSale.findOne({ isActive: true, startsAt: { $lte: now }, endsAt: { $gte: now } })
      .populate('products.product', 'name sku images');
    res.json({ success: true, data: sale });
  } catch (err) { next(err); }
};

exports.getOne = async (req, res, next) => {
  try {
    const sale = await FlashSale.findById(req.params.id).populate('products.product', 'name sku images price');
    if (!sale) return res.status(404).json({ success: false, message: 'Flash sale not found' });
    res.json({ success: true, data: sale });
  } catch (err) { next(err); }
};

exports.create = async (req, res, next) => {
  try {
    if (req.file) req.body.bannerImage = `/uploads/banners/${req.file.filename}`;
    const sale = await FlashSale.create(req.body);
    res.status(201).json({ success: true, data: sale });
  } catch (err) { next(err); }
};

exports.update = async (req, res, next) => {
  try {
    if (req.file) req.body.bannerImage = `/uploads/banners/${req.file.filename}`;
    const sale = await FlashSale.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!sale) return res.status(404).json({ success: false, message: 'Flash sale not found' });
    res.json({ success: true, data: sale });
  } catch (err) { next(err); }
};

exports.remove = async (req, res, next) => {
  try {
    const sale = await FlashSale.findByIdAndDelete(req.params.id);
    if (!sale) return res.status(404).json({ success: false, message: 'Flash sale not found' });
    res.json({ success: true, message: 'Flash sale deleted' });
  } catch (err) { next(err); }
};

exports.toggle = async (req, res, next) => {
  try {
    const sale = await FlashSale.findById(req.params.id);
    if (!sale) return res.status(404).json({ success: false, message: 'Flash sale not found' });
    sale.isActive = !sale.isActive;
    await sale.save();
    res.json({ success: true, data: sale, message: `Flash sale ${sale.isActive ? 'activated' : 'deactivated'}` });
  } catch (err) { next(err); }
};

exports.addProduct = async (req, res, next) => {
  try {
    const { productId, salePrice } = req.body;
    const product = await Product.findById(productId);
    if (!product) return res.status(404).json({ success: false, message: 'Product not found' });

    const sale = await FlashSale.findByIdAndUpdate(
      req.params.id,
      { $push: { products: { product: productId, salePrice, originalPrice: product.price } } },
      { new: true }
    ).populate('products.product', 'name price images');
    if (!sale) return res.status(404).json({ success: false, message: 'Flash sale not found' });
    res.json({ success: true, data: sale });
  } catch (err) { next(err); }
};

exports.removeProduct = async (req, res, next) => {
  try {
    const sale = await FlashSale.findByIdAndUpdate(
      req.params.id,
      { $pull: { products: { product: req.params.productId } } },
      { new: true }
    );
    if (!sale) return res.status(404).json({ success: false, message: 'Flash sale not found' });
    res.json({ success: true, data: sale });
  } catch (err) { next(err); }
};

exports.getStats = async (req, res, next) => {
  try {
    const [active, total] = await Promise.all([
      FlashSale.countDocuments({ isActive: true }),
      FlashSale.countDocuments(),
    ]);
    const [revenueAgg, discountAgg] = await Promise.all([
      FlashSale.aggregate([
        { $unwind: '$products' },
        { $group: { _id: null, totalRevenue: { $sum: { $multiply: ['$products.salePrice', '$products.soldCount'] } }, totalOrders: { $sum: '$products.soldCount' } } },
      ]),
      FlashSale.aggregate([
        { $group: { _id: null, avg: { $avg: '$discountPercent' } } },
      ]),
    ]);
    const stats = revenueAgg[0] || { totalRevenue: 0, totalOrders: 0 };
    const avgDiscount = discountAgg[0] ? Math.round(discountAgg[0].avg) : 0;
    res.json({ success: true, data: { active, total, ...stats, avgDiscount } });
  } catch (err) { next(err); }
};
