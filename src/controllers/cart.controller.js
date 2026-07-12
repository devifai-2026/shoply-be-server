const { getCartModel }    = require('../models/Cart');
const { getProductModel } = require('../models/Product');

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
    const Cart = getCartModel(req.tenantConn);
    const cart = await Cart.findOne({ customer: req.customer._id })
      .populate('items.product', 'name brand price discountPrice images stock status');

    if (!cart) return res.json({ success: true, data: [] });

    const items = cart.items
      .filter(i => i.product && i.product.status !== 'archived')
      .map(formatItem)
      .filter(Boolean);

    res.json({ success: true, data: items });
  } catch (err) { next(err); }
};

// POST /customer/cart/sync  — body: { items: [{ productId, quantity }] }
exports.syncCart = async (req, res, next) => {
  try {
    const Cart = getCartModel(req.tenantConn);
    const { items } = req.body;
    if (!Array.isArray(items)) {
      return res.status(400).json({ success: false, message: 'items must be an array' });
    }

    const mapped = items
      .filter(i => i.productId && Number.isInteger(i.quantity) && i.quantity > 0)
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
    const Cart = getCartModel(req.tenantConn);
    const Product = getProductModel(req.tenantConn);
    const { productId } = req.params;
    const requested = parseInt(req.body.quantity, 10);

    if (req.body.quantity !== undefined && (isNaN(requested) || requested <= 0)) {
      return res.status(400).json({ success: false, message: 'Quantity must be a positive integer' });
    }
    const quantity = Math.max(1, requested || 1);

    const product = await Product.findById(productId).lean();
    if (!product) return res.status(404).json({ success: false, message: 'Product not found' });

    let cart = await Cart.findOne({ customer: req.customer._id });
    if (!cart) cart = new Cart({ customer: req.customer._id, items: [] });

    const idx = cart.items.findIndex(i => i.product.toString() === productId);
    const stockCap = typeof product.stock === 'number' ? product.stock : Infinity;
    if (idx >= 0) {
      cart.items[idx].quantity = Math.min(cart.items[idx].quantity + quantity, stockCap);
    } else {
      cart.items.push({ product: productId, quantity: Math.min(quantity, stockCap) });
    }
    await cart.save();

    res.json({ success: true });
  } catch (err) { next(err); }
};

// PUT /customer/cart/:productId  — body: { quantity }
// A negative, zero, or non-numeric quantity is rejected with 400 rather than
// silently removing the item — removal is the explicit job of DELETE.
exports.updateItem = async (req, res, next) => {
  try {
    const Cart = getCartModel(req.tenantConn);
    const Product = getProductModel(req.tenantConn);
    const { productId } = req.params;
    const quantity = parseInt(req.body.quantity, 10);

    if (isNaN(quantity) || quantity <= 0) {
      return res.status(400).json({ success: false, message: 'Quantity must be a positive integer' });
    }

    const product = await Product.findById(productId).select('stock').lean();
    if (!product) return res.status(404).json({ success: false, message: 'Product not found' });
    if (typeof product.stock === 'number' && quantity > product.stock) {
      return res.status(400).json({ success: false, message: `Only ${product.stock} in stock` });
    }

    const updated = await Cart.findOneAndUpdate(
      { customer: req.customer._id, 'items.product': productId },
      { $set: { 'items.$.quantity': quantity } },
      { new: true },
    );
    if (!updated) return res.status(404).json({ success: false, message: 'Item not found in cart' });

    res.json({ success: true });
  } catch (err) { next(err); }
};

// DELETE /customer/cart/:productId
exports.removeItem = async (req, res, next) => {
  try {
    const Cart = getCartModel(req.tenantConn);
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
    const Cart = getCartModel(req.tenantConn);
    await Cart.findOneAndUpdate(
      { customer: req.customer._id },
      { $set: { items: [] } },
      { upsert: true },
    );
    res.json({ success: true });
  } catch (err) { next(err); }
};
