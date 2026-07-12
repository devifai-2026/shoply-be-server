const Brand   = require('../models/Brand');
const Product = require('../models/Product');

exports.list = async (req, res, next) => {
  try {
    const { search, isActive } = req.query;
    const filter = {};
    if (isActive !== undefined) filter.isActive = isActive === 'true';
    if (search) filter.name = { $regex: search, $options: 'i' };

    const brands = await Brand.find(filter)
      .populate('productCount')
      .sort({ sortOrder: 1, name: 1 });
    res.json({ success: true, data: brands });
  } catch (err) { next(err); }
};

exports.flat = async (req, res, next) => {
  try {
    const brands = await Brand.find({ isActive: true }).select('name slug logo').sort({ name: 1 }).lean();
    res.json({ success: true, data: brands });
  } catch (err) { next(err); }
};

exports.getOne = async (req, res, next) => {
  try {
    const brand = await Brand.findById(req.params.id).populate('productCount');
    if (!brand) return res.status(404).json({ success: false, message: 'Brand not found' });
    res.json({ success: true, data: brand });
  } catch (err) { next(err); }
};

exports.create = async (req, res, next) => {
  try {
    const data = { ...req.body };
    if (req.file) data.logo = `/uploads/brands/${req.file.filename}`;
    const brand = await Brand.create(data);
    res.status(201).json({ success: true, data: brand });
  } catch (err) { next(err); }
};

exports.update = async (req, res, next) => {
  try {
    const data = { ...req.body };
    if (req.file) data.logo = `/uploads/brands/${req.file.filename}`;
    const brand = await Brand.findByIdAndUpdate(req.params.id, data, { new: true, runValidators: true });
    if (!brand) return res.status(404).json({ success: false, message: 'Brand not found' });
    res.json({ success: true, data: brand });
  } catch (err) { next(err); }
};

exports.remove = async (req, res, next) => {
  try {
    const brand = await Brand.findById(req.params.id);
    if (!brand) return res.status(404).json({ success: false, message: 'Brand not found' });
    const hasProducts = await Product.exists({ brand: brand.name });
    if (hasProducts) return res.status(400).json({ success: false, message: 'Brand has associated products. Reassign them first.' });
    await Brand.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'Brand deleted' });
  } catch (err) { next(err); }
};

exports.toggle = async (req, res, next) => {
  try {
    const brand = await Brand.findById(req.params.id);
    if (!brand) return res.status(404).json({ success: false, message: 'Brand not found' });
    brand.isActive = !brand.isActive;
    await brand.save();
    res.json({ success: true, data: brand });
  } catch (err) { next(err); }
};
