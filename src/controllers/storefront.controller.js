const Product      = require('../models/Product');
const Category     = require('../models/Category');
const Brand        = require('../models/Brand');
const FlashSale    = require('../models/FlashSale');
const Appearance   = require('../models/Appearance');
const Coupon       = require('../models/Coupon');
const Review       = require('../models/Review');
const Vendor       = require('../models/Vendor');
const StoreSettings = require('../models/StoreSettings');
const AdminNotification = require('../models/AdminNotification');

// ─── Helpers ──────────────────────────────────────────────────────────────────

// Recursively collect a category ID and all its descendant IDs
const collectDescendantIds = async (rootId) => {
  const ids = [rootId];
  const children = await Category.find({ parent: rootId, isActive: true }).select('_id').lean();
  for (const child of children) {
    const nested = await collectDescendantIds(child._id);
    ids.push(...nested);
  }
  return ids;
};

// Resolve a slug to a category doc + all descendant IDs (for hierarchical filtering)
const resolveCategorySlug = async (slug) => {
  const cat = await Category.findOne({ slug, isActive: true }).lean();
  if (!cat) return null;
  const ids = await collectDescendantIds(cat._id);
  return { cat, ids };
};

// ─── Products ────────────────────────────────────────────────────────────────

exports.listProducts = async (req, res, next) => {
  try {
    const page  = Math.max(1, parseInt(req.query.page)  || 1);
    const limit = Math.min(100, parseInt(req.query.limit) || 20);
    const skip  = (page - 1) * limit;

    const filter = { status: 'active', visibleWeb: true };

    // ── Category filtering (slug-based, includes all descendants) ──────────
    if (req.query.categorySlug) {
      const resolved = await resolveCategorySlug(req.query.categorySlug);
      if (resolved) filter.category = { $in: resolved.ids };
      else filter.category = null; // no match → return empty
    } else if (req.query.category) {
      // legacy: raw ObjectId passed directly
      filter.category = req.query.category;
    }

    // ── Brand ──────────────────────────────────────────────────────────────
    if (req.query.brand) {
      const brands = req.query.brand.split(',').map(b => b.trim()).filter(Boolean);
      filter.brand = brands.length === 1 ? brands[0] : { $in: brands };
    }

    // ── Search ─────────────────────────────────────────────────────────────
    if (req.query.search) filter.$text = { $search: req.query.search };

    // ── Price range ────────────────────────────────────────────────────────
    if (req.query.minPrice || req.query.maxPrice) {
      filter.price = {};
      if (req.query.minPrice) filter.price.$gte = Number(req.query.minPrice);
      if (req.query.maxPrice) filter.price.$lte = Number(req.query.maxPrice);
    }

    // ── Attributes (size, color) ───────────────────────────────────────────
    if (req.query.size) {
      const sizes = req.query.size.split(',').map(s => s.trim()).filter(Boolean);
      filter['attributes.size'] = sizes.length === 1 ? sizes[0] : { $in: sizes };
    }
    if (req.query.color) {
      const colors = req.query.color.split(',').map(c => c.trim()).filter(Boolean);
      filter['attributes.color'] = colors.length === 1 ? colors[0] : { $in: colors };
    }

    // ── Stock / availability ───────────────────────────────────────────────
    if (req.query.inStock === 'true') filter.stock = { $gt: 0 };

    // ── Sort ───────────────────────────────────────────────────────────────
    const sortMap = {
      newest:      { createdAt: -1 },
      'price-asc': { price: 1 },
      'price-desc':{ price: -1 },
      popular:     { soldCount: -1 },
      rating:      { rating: -1 },
    };
    const sort = sortMap[req.query.sort] || { createdAt: -1 };

    // ── Main query + count ─────────────────────────────────────────────────
    const [products, total] = await Promise.all([
      Product.find(filter)
        .populate('category', 'name slug parent depth')
        .populate('vendor', 'storeName slug logo rating')
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .lean({ virtuals: true }),
      Product.countDocuments(filter),
    ]);

    // ── Facets (filter options for the current result set) ─────────────────
    const facetFilter = { ...filter };
    // Remove attribute-level filters from facet query so we get full option lists
    delete facetFilter['attributes.size'];
    delete facetFilter['attributes.color'];
    delete facetFilter.price;

    const [facetDocs] = await Product.aggregate([
      { $match: facetFilter },
      {
        $group: {
          _id:      null,
          sizes:    { $addToSet: '$attributes.size' },
          colors:   { $addToSet: '$attributes.color' },
          brands:   { $addToSet: '$brand' },
          minPrice: { $min: '$price' },
          maxPrice: { $max: '$price' },
        },
      },
    ]);

    const facets = facetDocs
      ? {
          sizes:    (facetDocs.sizes  || []).filter(Boolean).sort(),
          colors:   (facetDocs.colors || []).filter(Boolean).sort(),
          brands:   (facetDocs.brands || []).filter(Boolean).sort(),
          minPrice: facetDocs.minPrice || 0,
          maxPrice: facetDocs.maxPrice || 9999,
        }
      : { sizes: [], colors: [], brands: [], minPrice: 0, maxPrice: 9999 };

    res.json({
      success: true,
      data: products,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
      facets,
    });
  } catch (err) { next(err); }
};

exports.getProduct = async (req, res, next) => {
  try {
    const { id } = req.params;
    const product = await Product.findOne({ _id: id, status: 'active', visibleWeb: true })
      .populate('category', 'name slug parent depth')
      .populate('vendor', 'storeName slug logo rating description')
      .lean({ virtuals: true });
    if (!product) return res.status(404).json({ success: false, message: 'Product not found' });

    const related = await Product.find({
      category: product.category?._id || product.category,
      status:   'active',
      visibleWeb: true,
      _id:      { $ne: product._id },
    })
      .limit(8)
      .lean({ virtuals: true });

    const reviews = await Review.find({ product: product._id, status: 'approved' })
      .populate('customer', 'name avatar')
      .sort({ createdAt: -1 })
      .limit(10)
      .lean();

    res.json({ success: true, data: { ...product, related, reviews } });
  } catch (err) { next(err); }
};

// ─── Categories ──────────────────────────────────────────────────────────────

const buildTree = (flat, parentId = null) =>
  flat
    .filter(c => String(c.parent || null) === String(parentId))
    .map(c => ({
      ...c,
      subCategories: buildTree(flat, c._id),
    }));

exports.listCategories = async (req, res, next) => {
  try {
    const cats = await Category.find({ isActive: true })
      .sort({ depth: 1, sortOrder: 1 })
      .lean();
    res.json({ success: true, data: buildTree(cats) });
  } catch (err) { next(err); }
};

// ─── Brands ──────────────────────────────────────────────────────────────────

exports.listBrands = async (req, res, next) => {
  try {
    const brands = await Brand.find({ isActive: true })
      .select('name slug logo')
      .sort({ sortOrder: 1, name: 1 })
      .lean();
    res.json({ success: true, data: brands });
  } catch (err) { next(err); }
};

// ─── Flash Sale ───────────────────────────────────────────────────────────────

exports.getActiveFlashSale = async (req, res, next) => {
  try {
    const now  = new Date();
    const sale = await FlashSale.findOne({ isActive: true, startsAt: { $lte: now }, endsAt: { $gte: now } })
      .populate('products.product', 'name sku images price discountPrice');
    res.json({ success: true, data: sale });
  } catch (err) { next(err); }
};

// ─── Appearance ───────────────────────────────────────────────────────────────

exports.getAppearance = async (req, res, next) => {
  try {
    const [appearance, storeSettings] = await Promise.all([
      Appearance.findOneAndUpdate(
        { storeId: 'default' },
        { $setOnInsert: { storeId: 'default' } },
        { upsert: true, new: true }
      ),
      StoreSettings.findOne({ storeId: 'default' }).select('regional orders general social').lean(),
    ]);
    const data = appearance.toObject();

    // Migrate old promoBanner1/2 format → promoBanners array
    if (!data.homepageContent) data.homepageContent = {};
    const hc = data.homepageContent;
    if (!hc.promoBanners || hc.promoBanners.length === 0) {
      const b1 = hc.promoBanner1 || {};
      const b2 = hc.promoBanner2 || {};
      hc.promoBanners = [
        { subtitle: b1.subtitle || '', title: b1.title || '', cta: b1.cta || 'Shop Now', link: b1.link || '/products', image: b1.image || null },
        { subtitle: b2.subtitle || '', title: b2.title || '', cta: b2.cta || 'Explore',  link: b2.link || '/products', image: b2.image || null },
      ];
    }

    data.regional = storeSettings?.regional ?? {};
    data.tax = {
      gstRate:     storeSettings?.orders?.gstRate     ?? 0,
      taxIncluded: storeSettings?.orders?.taxIncluded ?? false,
    };
    data.storeName    = storeSettings?.general?.storeName    || 'My Store';
    data.supportEmail = storeSettings?.general?.supportEmail || '';
    data.phone        = storeSettings?.general?.phone        || '';
    data.address      = storeSettings?.general?.address      || '';
    data.social = {
      facebook:  storeSettings?.social?.facebook  || '',
      instagram: storeSettings?.social?.instagram || '',
      twitter:   storeSettings?.social?.twitter   || '',
      youtube:   storeSettings?.social?.youtube   || '',
      whatsapp:  storeSettings?.social?.whatsapp  || '',
      tiktok:    storeSettings?.social?.tiktok    || '',
    };
    res.set('Cache-Control', 'no-store');
    res.json({ success: true, data });
  } catch (err) { next(err); }
};

// ─── Coupons ──────────────────────────────────────────────────────────────────

exports.validateCoupon = async (req, res, next) => {
  try {
    const { code, orderTotal, platform } = req.body;
    if (!code) return res.status(400).json({ success: false, message: 'Coupon code is required' });

    const coupon = await Coupon.findOne({ code: code.toUpperCase() });
    if (!coupon) return res.status(404).json({ success: false, message: 'Invalid coupon code' });

    const { valid, reason } = coupon.isValid(orderTotal || 0, platform || 'web');
    if (!valid) return res.status(400).json({ success: false, message: reason });

    let discount = 0;
    if (coupon.discountType === 'percent') {
      discount = Math.round((orderTotal || 0) * (coupon.discountValue / 100));
      if (coupon.maxDiscount) discount = Math.min(discount, coupon.maxDiscount);
    } else {
      discount = coupon.discountValue;
    }

    res.json({ success: true, data: { coupon, discount, finalAmount: (orderTotal || 0) - discount } });
  } catch (err) { next(err); }
};

// ─── Reviews ──────────────────────────────────────────────────────────────────

exports.getProductReviews = async (req, res, next) => {
  try {
    const page  = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(50, parseInt(req.query.limit) || 10);
    const skip  = (page - 1) * limit;

    const filter = { product: req.params.id, status: 'approved' };
    const [reviews, total] = await Promise.all([
      Review.find(filter)
        .populate('customer', 'name avatar')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Review.countDocuments(filter),
    ]);
    res.json({ success: true, data: reviews, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
  } catch (err) { next(err); }
};

exports.submitReview = async (req, res, next) => {
  try {
    const { rating, title, content, orderId } = req.body;
    if (!rating || !content) {
      return res.status(400).json({ success: false, message: 'Rating and content are required' });
    }

    const existing = await Review.findOne({ product: req.params.id, customer: req.customer._id });
    if (existing) {
      return res.status(409).json({ success: false, message: 'You have already reviewed this product' });
    }

    const settings    = await StoreSettings.findOne({ storeId: 'default' }).select('reviews');
    const autoApprove = settings?.reviews?.autoApprove || false;

    const review = await Review.create({
      product:  req.params.id,
      customer: req.customer._id,
      order:    orderId || null,
      rating,
      title:    title || '',
      content,
      status:   autoApprove ? 'approved' : 'pending',
    });

    if (autoApprove) {
      const result = await Review.aggregate([
        { $match: { product: review.product, status: 'approved' } },
        { $group: { _id: null, avg: { $avg: '$rating' }, count: { $sum: 1 } } },
      ]);
      await Product.findByIdAndUpdate(req.params.id, {
        rating:      result[0]?.avg || 0,
        reviewCount: result[0]?.count || 0,
      });
    }

    await AdminNotification.create({
      type:    'review',
      title:   'New Review Submitted',
      message: `${autoApprove ? 'Auto-approved' : 'Pending'} review for product ${req.params.id}`,
      link:    '/reviews',
    });

    res.status(201).json({ success: true, data: review });
  } catch (err) { next(err); }
};

// ─── Vendor storefront ─────────────────────────────────────────────────────────

exports.getVendorStore = async (req, res, next) => {
  try {
    const vendor = await Vendor.findOne({ slug: req.params.slug, status: 'approved' })
      .select('storeName slug logo banner description rating createdAt')
      .lean();
    if (!vendor) return res.status(404).json({ success: false, message: 'Store not found' });

    const page  = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(50, parseInt(req.query.limit) || 20);
    const skip  = (page - 1) * limit;
    const filter = { vendor: vendor._id, status: 'active', visibleWeb: true };

    const [products, total] = await Promise.all([
      Product.find(filter)
        .populate('category', 'name slug')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean({ virtuals: true }),
      Product.countDocuments(filter),
    ]);

    res.json({
      success: true,
      data: {
        vendor: { ...vendor, productCount: total },
        products,
      },
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (err) { next(err); }
};
