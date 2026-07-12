const Customer = require('../models/Customer');
const Product  = require('../models/Product');

exports.getWishlist = async (req, res, next) => {
  try {
    const customer = await Customer.findById(req.customer._id)
      .populate('wishlist', 'name slug price originalPrice images brand stock');
    res.json({ success: true, data: customer.wishlist || [] });
  } catch (err) { next(err); }
};

exports.toggleWishlist = async (req, res, next) => {
  try {
    const { productId } = req.params;

    const product = await Product.findById(productId).lean();
    if (!product) return res.status(404).json({ success: false, message: 'Product not found' });

    const customer = await Customer.findById(req.customer._id);
    const alreadyIn = customer.wishlist.some(id => id.toString() === productId);

    if (alreadyIn) {
      await Customer.findByIdAndUpdate(req.customer._id, { $pull: { wishlist: productId } });
    } else {
      await Customer.findByIdAndUpdate(req.customer._id, { $addToSet: { wishlist: productId } });
    }

    res.json({ success: true, added: !alreadyIn });
  } catch (err) { next(err); }
};

exports.removeFromWishlist = async (req, res, next) => {
  try {
    const { productId } = req.params;
    await Customer.findByIdAndUpdate(req.customer._id, { $pull: { wishlist: productId } });
    res.json({ success: true, added: false });
  } catch (err) { next(err); }
};
