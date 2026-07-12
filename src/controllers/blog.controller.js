const Blog = require('../models/Blog');

exports.listPublic = async (req, res, next) => {
  try {
    const { category, page = 1, limit = 20 } = req.query;
    const filter = { status: 'published' };
    if (category) filter.category = { $regex: category, $options: 'i' };

    const skip = (Number(page) - 1) * Number(limit);
    const [posts, total] = await Promise.all([
      Blog.find(filter)
        .select('title slug excerpt coverImage category tags publishedAt views')
        .sort({ publishedAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .lean(),
      Blog.countDocuments(filter),
    ]);

    res.json({ success: true, data: posts, total, page: Number(page), pages: Math.ceil(total / Number(limit)) });
  } catch (err) { next(err); }
};

exports.getOnePublic = async (req, res, next) => {
  try {
    const post = await Blog.findOne({ _id: req.params.id, status: 'published' })
      .select('title slug excerpt content coverImage category tags publishedAt views')
      .lean();
    if (!post) return res.status(404).json({ success: false, message: 'Blog post not found' });
    res.json({ success: true, data: post });
  } catch (err) { next(err); }
};

exports.list = async (req, res, next) => {
  try {
    const { search, status, category, page = 1, limit = 20 } = req.query;
    const filter = {};
    if (status)   filter.status   = status;
    if (category) filter.category = { $regex: category, $options: 'i' };
    if (search)   filter.$or = [
      { title:   { $regex: search, $options: 'i' } },
      { excerpt: { $regex: search, $options: 'i' } },
    ];

    const skip = (Number(page) - 1) * Number(limit);
    const [posts, total] = await Promise.all([
      Blog.find(filter)
        .populate('author', 'name')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .lean(),
      Blog.countDocuments(filter),
    ]);

    res.json({ success: true, data: posts, total, page: Number(page), pages: Math.ceil(total / Number(limit)) });
  } catch (err) { next(err); }
};

exports.getOne = async (req, res, next) => {
  try {
    const post = await Blog.findById(req.params.id).populate('author', 'name');
    if (!post) return res.status(404).json({ success: false, message: 'Blog post not found' });
    res.json({ success: true, data: post });
  } catch (err) { next(err); }
};

exports.create = async (req, res, next) => {
  try {
    const data = { ...req.body };
    if (req.file) data.coverImage = `/uploads/blogs/${req.file.filename}`;
    if (data.tags && typeof data.tags === 'string') {
      data.tags = data.tags.split(',').map(t => t.trim()).filter(Boolean);
    }
    data.author = req.admin._id;
    if (data.status === 'published' && !data.publishedAt) {
      data.publishedAt = new Date();
    }
    const post = await Blog.create(data);
    res.status(201).json({ success: true, data: post });
  } catch (err) { next(err); }
};

exports.update = async (req, res, next) => {
  try {
    const data = { ...req.body };
    if (req.file) data.coverImage = `/uploads/blogs/${req.file.filename}`;
    if (data.tags && typeof data.tags === 'string') {
      data.tags = data.tags.split(',').map(t => t.trim()).filter(Boolean);
    }
    const existing = await Blog.findById(req.params.id);
    if (!existing) return res.status(404).json({ success: false, message: 'Blog post not found' });
    if (data.status === 'published' && existing.status !== 'published' && !existing.publishedAt) {
      data.publishedAt = new Date();
    }
    const post = await Blog.findByIdAndUpdate(req.params.id, data, { new: true, runValidators: true });
    res.json({ success: true, data: post });
  } catch (err) { next(err); }
};

exports.remove = async (req, res, next) => {
  try {
    const post = await Blog.findByIdAndDelete(req.params.id);
    if (!post) return res.status(404).json({ success: false, message: 'Blog post not found' });
    res.json({ success: true, message: 'Blog post deleted' });
  } catch (err) { next(err); }
};
