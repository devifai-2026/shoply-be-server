const Cart    = require('../models/Cart');
const Product = require('../models/Product');

function formatItem(i) {
  if (!i.product) return null;
  const p = i.product;
  return {
    productId:     p._id.toString(),
    name:          p.name,
    brand:         p.brand || null,
    price:         p.price,
    discountPrice: p.discountPrice || null,
    image:         p.images?.[0] || null,
    quantity:      i.quantity,
  };
}

// GET /customer/cart
exports.getCart = async (req, res, next) => {
  try {
    const cart = await Cart.findOne({ customer: req.customer._id })
      .populate('items.product', 'name brand price discountPrice images stock status');

    if (!cart) return res.json({ success: true, data: [] });

    const items = cart.items
      .filter(i => i.product && i.product.status !== 'archived')
      .map(formatItem)
      .filter(Boolean);

      console.log('Cart items:', items); // Debugging line to check the items

    res.json({ success: true, data: items });
  } catch (err) { next(err); }
};

// POST /customer/cart/sync  — body: { items: [{ productId, quantity }] }
exports.syncCart = async (req, res, next) => {
  try {
    const { items } = req.body;
    if (!Array.isArray(items)) {
      return res.status(400).json({ success: false, message: 'items must be an array' });
    }

    const mapped = items
      .filter(i => i.productId && i.quantity > 0)
      .map(i => ({ product: i.productId, quantity: i.quantity }));

    await Cart.findOneAndUpdate(
      { customer: req.customer._id },
      { $set: { items: mapped } },
      { upsert: true, new: true },
    );

    res.json({ success: true });
  } catch (err) { next(err); }
};

// POST /customer/cart/:productId  — body: { quantity }
exports.addItem = async (req, res, next) => {
  try {
    const { productId } = req.params;
    const quantity = Math.max(1, parseInt(req.body.quantity) || 1);

    const product = await Product.findById(productId).lean();
    if (!product) return res.status(404).json({ success: false, message: 'Product not found' });

    let cart = await Cart.findOne({ customer: req.customer._id });
    if (!cart) cart = new Cart({ customer: req.customer._id, items: [] });

    const idx = cart.items.findIndex(i => i.product.toString() === productId);
    if (idx >= 0) {
      cart.items[idx].quantity += quantity;
    } else {
      cart.items.push({ product: productId, quantity });
    }
    await cart.save();

    res.json({ success: true });
  } catch (err) { next(err); }
};

// PUT /customer/cart/:productId  — body: { quantity }
exports.updateItem = async (req, res, next) => {
  try {
    const { productId } = req.params;
    const quantity = parseInt(req.body.quantity);

    if (isNaN(quantity) || quantity <= 0) {
      await Cart.findOneAndUpdate(
        { customer: req.customer._id },
        { $pull: { items: { product: productId } } },
      );
    } else {
      await Cart.findOneAndUpdate(
        { customer: req.customer._id, 'items.product': productId },
        { $set: { 'items.$.quantity': quantity } },
      );
    }

    res.json({ success: true });
  } catch (err) { next(err); }
};

// DELETE /customer/cart/:productId
exports.removeItem = async (req, res, next) => {
  try {
    const { productId } = req.params;
    await Cart.findOneAndUpdate(
      { customer: req.customer._id },
      { $pull: { items: { product: productId } } },
    );
    res.json({ success: true });
  } catch (err) { next(err); }
};

// DELETE /customer/cart
exports.clearCart = async (req, res, next) => {
  try {
    await Cart.findOneAndUpdate(
      { customer: req.customer._id },
      { $set: { items: [] } },
      { upsert: true },
    );
    res.json({ success: true });
  } catch (err) { next(err); }
};
