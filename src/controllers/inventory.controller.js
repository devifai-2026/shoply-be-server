const Product              = require('../models/Product');
const AdminNotification    = require('../models/AdminNotification');

exports.list = async (req, res, next) => {
  try {
    const filter = {};
    if (req.query.status === 'low') filter.$expr = { $and: [{ $gt: ['$stock', 0] }, { $lte: ['$stock', '$alertLevel'] }] };
    if (req.query.status === 'out') filter.stock = 0;

    const products = await Product.find(filter)
      .select('name sku stock alertLevel status images category')
      .populate('category', 'name')
      .sort({ stock: 1 })
      .lean({ virtuals: true });

    const enriched = products.map(p => ({
      ...p,
      stockStatus: p.stock === 0 ? 'out' : p.stock <= p.alertLevel ? 'low' : 'ok',
    }));

    res.json({ success: true, data: enriched });
  } catch (err) { next(err); }
};

exports.getAlerts = async (req, res, next) => {
  try {
    const [outOfStock, lowStock] = await Promise.all([
      Product.countDocuments({ stock: 0 }),
      Product.countDocuments({ $expr: { $and: [{ $gt: ['$stock', 0] }, { $lte: ['$stock', '$alertLevel'] }] } }),
    ]);
    res.json({ success: true, data: { outOfStock, lowStock } });
  } catch (err) { next(err); }
};

exports.updateStock = async (req, res, next) => {
  try {
    const { stock, alertLevel } = req.body;
    const update = {};
    if (stock !== undefined)      update.stock      = stock;
    if (alertLevel !== undefined) update.alertLevel = alertLevel;

    const product = await Product.findByIdAndUpdate(req.params.productId, update, { new: true, runValidators: true });
    if (!product) return res.status(404).json({ success: false, message: 'Product not found' });

    if (product.stock <= product.alertLevel) {
      await AdminNotification.create({
        type:    'low_stock',
        title:   'Low Stock Alert',
        message: `"${product.name}" stock is at ${product.stock} units`,
        link:    `/inventory`,
        meta:    { productId: product._id.toString() },
      });
    }

    res.json({ success: true, data: product });
  } catch (err) { next(err); }
};

exports.restock = async (req, res, next) => {
  try {
    const { quantity } = req.body;
    if (!quantity || quantity <= 0) {
      return res.status(400).json({ success: false, message: 'Quantity must be positive' });
    }
    const product = await Product.findByIdAndUpdate(
      req.params.productId,
      { $inc: { stock: quantity } },
      { new: true }
    );
    if (!product) return res.status(404).json({ success: false, message: 'Product not found' });
    res.json({ success: true, data: product, message: `Added ${quantity} units to "${product.name}"` });
  } catch (err) { next(err); }
};
