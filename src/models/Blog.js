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

// Default-connection model — the single shared `ecom.Blog` collection,
// preserved for any request that doesn't resolve to a tenant subdomain.
const BlogDefault = mongoose.model('Blog', blogSchema);

// Per-tenant-connection resolver. Each mongoose Connection keeps its own model
// registry, so registering 'Blog' on a tenant connection never collides with
// the default connection's registration (OverwriteModelError only happens when
// re-registering on the SAME connection).
function getBlogModel(conn) {
  if (!conn) return BlogDefault;
  return conn.models.Blog || conn.model('Blog', blogSchema);
}

module.exports = BlogDefault;
module.exports.getBlogModel = getBlogModel;
