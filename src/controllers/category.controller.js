const Category = require('../models/Category');
const Product  = require('../models/Product');

const buildTree = (categories, parentId = null) =>
  categories
    .filter(c => String(c.parent || null) === String(parentId))
    .map(c => ({
      ...c.toObject({ virtuals: true }),
      subCategories: buildTree(categories, c._id),
    }));

exports.list = async (req, res, next) => {
  try {
    const categories = await Category.find({ isActive: true }).sort({ depth: 1, sortOrder: 1 });
    const tree       = buildTree(categories);
    res.json({ success: true, data: tree });
  } catch (err) { next(err); }
};

exports.flat = async (req, res, next) => {
  try {
    const categories = await Category.find().sort({ name: 1 }).lean();
    res.json({ success: true, data: categories });
  } catch (err) { next(err); }
};

exports.getOne = async (req, res, next) => {
  try {
    const category = await Category.findById(req.params.id).populate('parent', 'name slug');
    if (!category) return res.status(404).json({ success: false, message: 'Category not found' });
    res.json({ success: true, data: category });
  } catch (err) { next(err); }
};

exports.create = async (req, res, next) => {
  try {
    const data = { ...req.body };
    if (data.parent) {
      const parent = await Category.findById(data.parent);
      data.depth   = parent ? parent.depth + 1 : 0;
    }
    if (req.file) data.image = `/uploads/categories/${req.file.filename}`;
    const category = await Category.create(data);
    res.status(201).json({ success: true, data: category });
  } catch (err) { next(err); }
};

exports.update = async (req, res, next) => {
  try {
    const data = { ...req.body };
    if ('parent' in data && !data.parent) data.parent = null;
    if (req.file) data.image = `/uploads/categories/${req.file.filename}`;
    const category = await Category.findByIdAndUpdate(req.params.id, data, { new: true, runValidators: true });
    if (!category) return res.status(404).json({ success: false, message: 'Category not found' });
    res.json({ success: true, data: category });
  } catch (err) { next(err); }
};

exports.remove = async (req, res, next) => {
  try {
    const hasChildren = await Category.exists({ parent: req.params.id });
    if (hasChildren) return res.status(400).json({ success: false, message: 'Remove sub-categories first' });
    const hasProducts = await Product.exists({ category: req.params.id });
    if (hasProducts) return res.status(400).json({ success: false, message: 'Category has associated products' });
    await Category.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'Category deleted' });
  } catch (err) { next(err); }
};

exports.reorder = async (req, res, next) => {
  try {
    const { items } = req.body; // [{ id, sortOrder }]
    await Promise.all(items.map(({ id, sortOrder }) =>
      Category.findByIdAndUpdate(id, { sortOrder })
    ));
    res.json({ success: true, message: 'Order updated' });
  } catch (err) { next(err); }
};
