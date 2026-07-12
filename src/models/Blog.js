const mongoose = require('mongoose');

const blogSchema = new mongoose.Schema({
  title:       { type: String, required: true, trim: true },
  slug:        { type: String, required: true, unique: true, lowercase: true, trim: true },
  excerpt:     { type: String, default: '' },
  content:     { type: String, default: '' },
  coverImage:  { type: String, default: null },
  category:    { type: String, default: '', trim: true },
  tags:        [{ type: String, trim: true }],
  status:      { type: String, enum: ['draft', 'published'], default: 'draft' },
  author:      { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
  seoTitle:    { type: String, default: '' },
  seoDesc:     { type: String, default: '' },
  views:       { type: Number, default: 0 },
  publishedAt: { type: Date, default: null },
}, { timestamps: true });

blogSchema.index({ status: 1, publishedAt: -1 });
blogSchema.index({ title: 'text', excerpt: 'text' });

module.exports = mongoose.model('Blog', blogSchema);
