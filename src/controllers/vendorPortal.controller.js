const { getProductModel } = require('../models/Product');
const { getSubOrderModel } = require('../models/SubOrder');
const { getOrderModel } = require('../models/Order');
const { getVendorModel } = require('../models/Vendor');
const { getWithdrawalRequestModel } = require('../models/WithdrawalRequest');
const { getAdminNotificationModel } = require('../models/AdminNotification');
const { getStoreSettingsModel } = require('../models/StoreSettings');
const shiprocket = require('../services/shiprocket.service');
const delhivery  = require('../services/delhivery.service');
const invoiceService = require('../services/invoice.service');
const aiReviewService = require('../services/aiReview.service');
const { rollupOrderStatus } = require('../utils/orderStatusRollup');
const { isAiReviewEnabled } = require('../utils/tenantAddons');
const { notifyAdmin } = require('../utils/notify');

// Turn uploaded files into server-relative URLs (served from /uploads)
exports.uploadImages = async (req, res, next) => {
  try {
    const files = req.files || [];
    if (!files.length) return res.status(400).json({ success: false, message: 'No images uploaded' });
    const urls = files.map(f => `/uploads/products/${f.filename}`);
    res.status(201).json({ success: true, data: { urls } });
  } catch (err) { next(err); }
};

const paginate = (req, cap = 50) => {
  const page  = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(cap, parseInt(req.query.limit) || 20);
  return { page, limit, skip: (page - 1) * limit };
};

// ─── Products (scoped to the vendor) ─────────────────────────────────────────

exports.listProducts = async (req, res, next) => {
  try {
    const Product = getProductModel(req.tenantConn);
    const { page, limit, skip } = paginate(req);
    const filter = { vendor: req.vendor._id };
    if (req.query.status && req.query.status !== 'all') filter.status = req.query.status;
    if (req.query.search) filter.$text = { $search: req.query.search };

    const [products, total] = await Promise.all([
      Product.find(filter).populate('category', 'name').sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      Product.countDocuments(filter),
    ]);
    res.json({ success: true, data: products, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
  } catch (err) { next(err); }
};

exports.createProduct = async (req, res, next) => {
  try {
    const Product = getProductModel(req.tenantConn);
    const Vendor  = getVendorModel(req.tenantConn);
    const body = { ...req.body };
    body.vendor = req.vendor._id;   // ownership is never client-chosen
    delete body.soldCount; delete body.rating; delete body.reviewCount;
    delete body.moderationStatus; delete body.moderationNote; delete body.aiReview; // never client-chosen

    const vendor = await Vendor.findById(req.vendor._id).select('autoApprove').lean();
    body.status = 'draft';           // vendor listings go live only when published/approved
    body.moderationStatus = 'pending';
    if (vendor?.autoApprove) {
      body.status = 'active';
      body.moderationStatus = 'approved';
    }

    const product = await Product.create(body);
    res.status(201).json({ success: true, data: product });

    // AI review is a premium, PO-gated add-on — always runs when enabled,
    // even for auto-approved vendors (confirmed: acts as a safety net and
    // can pull an already-live listing back). Fire-and-forget: never
    // blocks or delays the vendor's own create-product response.
    if (isAiReviewEnabled(req.tenant)) {
      aiReviewService.reviewProduct(product, {
        tenantConn: req.tenantConn,
        tenantSlug: req.tenant?.slug,
        wasAutoApproved: !!vendor?.autoApprove,
      }).catch(err => console.error('[AIReview] failed for product', product._id, err.message));
    }
  } catch (err) { next(err); }
};

// Fields whose change should re-trigger moderation — a vendor could
// otherwise get one product approved and then silently swap in different,
// never-reviewed content under the same _id.
const MODERATION_SENSITIVE_FIELDS = ['name', 'description', 'images', 'category'];

exports.updateProduct = async (req, res, next) => {
  try {
    const Product = getProductModel(req.tenantConn);
    const Vendor  = getVendorModel(req.tenantConn);
    const body = { ...req.body };
    delete body.vendor; delete body.soldCount; delete body.rating; delete body.reviewCount;
    delete body.moderationStatus; delete body.moderationNote; delete body.aiReview; // never client-chosen

    const existing = await Product.findOne({ _id: req.params.id, vendor: req.vendor._id })
      .select('status moderationStatus vendor').lean();
    if (!existing) return res.status(404).json({ success: false, message: 'Product not found' });

    const vendor = await Vendor.findById(req.vendor._id).select('autoApprove').lean();
    const touchesSensitiveField = MODERATION_SENSITIVE_FIELDS.some(f => body[f] !== undefined);
    // Only re-queue for review if it was already approved and isn't exempt
    // via auto-approve — don't yank a live listing just for a typo fix,
    // the NEXT bulk-approve/AI pass re-confirms it (see plan 0.3).
    if (touchesSensitiveField && !vendor?.autoApprove &&
        ['approved', 'ai_approved'].includes(existing.moderationStatus)) {
      body.moderationStatus = 'pending';
    }

    const product = await Product.findOneAndUpdate(
      { _id: req.params.id, vendor: req.vendor._id },
      body,
      { new: true, runValidators: true },
    );
    if (!product) return res.status(404).json({ success: false, message: 'Product not found' });
    res.json({ success: true, data: product });

    if (touchesSensitiveField && body.moderationStatus === 'pending' && isAiReviewEnabled(req.tenant)) {
      aiReviewService.reviewProduct(product, {
        tenantConn: req.tenantConn,
        tenantSlug: req.tenant?.slug,
        wasAutoApproved: false,
      }).catch(err => console.error('[AIReview] failed for product', product._id, err.message));
    }
  } catch (err) { next(err); }
};

exports.deleteProduct = async (req, res, next) => {
  try {
    const Product = getProductModel(req.tenantConn);
    const product = await Product.findOneAndDelete({ _id: req.params.id, vendor: req.vendor._id });
    if (!product) return res.status(404).json({ success: false, message: 'Product not found' });
    res.json({ success: true, message: 'Product deleted' });
  } catch (err) { next(err); }
};

// ─── Sub-orders ──────────────────────────────────────────────────────────────

exports.listSubOrders = async (req, res, next) => {
  try {
    const SubOrder = getSubOrderModel(req.tenantConn);
    const { page, limit, skip } = paginate(req);
    const filter = { vendor: req.vendor._id };
    if (req.query.status && req.query.status !== 'all') filter.status = req.query.status;

    const [subOrders, total] = await Promise.all([
      SubOrder.find(filter)
        .populate('order', 'orderNumber shippingAddress paymentMethod paymentStatus createdAt')
        .sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      SubOrder.countDocuments(filter),
    ]);
    res.json({ success: true, data: subOrders, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
  } catch (err) { next(err); }
};

exports.getSubOrder = async (req, res, next) => {
  try {
    const SubOrder = getSubOrderModel(req.tenantConn);
    const subOrder = await SubOrder.findOne({ _id: req.params.id, vendor: req.vendor._id })
      .populate('order', 'orderNumber shippingAddress paymentMethod paymentStatus customer createdAt');
    if (!subOrder) return res.status(404).json({ success: false, message: 'Order not found' });
    res.json({ success: true, data: subOrder });
  } catch (err) { next(err); }
};

// GET /vendor/orders/:id/invoice — PDF invoice for just this vendor's slice
// of a (possibly multi-vendor) order, using the vendor's own GSTIN/toggle.
exports.getSubOrderInvoice = async (req, res, next) => {
  try {
    const SubOrder = getSubOrderModel(req.tenantConn);
    const StoreSettings = getStoreSettingsModel(req.tenantConn);
    const subOrder = await SubOrder.findOne({ _id: req.params.id, vendor: req.vendor._id })
      .populate('order', 'orderNumber invoiceNumber shippingAddress discount bundleSavings createdAt customer')
      .lean();
    if (!subOrder) return res.status(404).json({ success: false, message: 'Order not found' });

    const storeSettings = await StoreSettings.findOne({ storeId: 'default' }).select('general').lean();
    const docDefinition = invoiceService.buildInvoiceDocDefinition({
      order: subOrder.order,
      scope: subOrder,
      seller: req.vendor,
      customer: subOrder.order?.customer,
      storeSettings,
    });
    const pdfBuffer = await invoiceService.renderPdfBuffer(docDefinition);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${subOrder.subNumber}.pdf"`);
    res.send(pdfBuffer);
  } catch (err) { next(err); }
};

const VENDOR_STATUS_FLOW = {
  pending:    ['processing', 'cancelled'],
  processing: ['shipped', 'cancelled'],
  shipped:    ['delivered'],
};

exports.updateSubOrderStatus = async (req, res, next) => {
  try {
    const SubOrder = getSubOrderModel(req.tenantConn);
    const Order    = getOrderModel(req.tenantConn);
    const { status, trackingNumber, courierName, note } = req.body;
    const subOrder = await SubOrder.findOne({ _id: req.params.id, vendor: req.vendor._id });
    if (!subOrder) return res.status(404).json({ success: false, message: 'Order not found' });

    const allowed = VENDOR_STATUS_FLOW[subOrder.status] || [];
    if (!allowed.includes(status)) {
      return res.status(400).json({ success: false, message: `Cannot move from ${subOrder.status} to ${status}` });
    }

    subOrder.status = status;
    if (trackingNumber) subOrder.trackingNumber = trackingNumber;
    if (courierName)    subOrder.courierName = courierName;
    subOrder.timeline.push({ status, note: note || `Updated by vendor` });
    await subOrder.save();
    await rollupOrderStatus(Order, SubOrder, subOrder.order);
    res.json({ success: true, data: subOrder });
  } catch (err) { next(err); }
};

// ─── Dashboard / analytics ───────────────────────────────────────────────────

exports.dashboard = async (req, res, next) => {
  try {
    const Product = getProductModel(req.tenantConn);
    const SubOrder = getSubOrderModel(req.tenantConn);
    const vendorId = req.vendor._id;
    const since30 = new Date(Date.now() - 30 * 24 * 3600 * 1000);

    const [totals, last30, statusCounts, productCount, lowStock, recent] = await Promise.all([
      SubOrder.aggregate([
        { $match: { vendor: vendorId, status: { $nin: ['cancelled', 'refunded'] } } },
        { $group: { _id: null, revenue: { $sum: '$subtotal' }, earning: { $sum: '$vendorEarning' }, orders: { $sum: 1 } } },
      ]),
      SubOrder.aggregate([
        { $match: { vendor: vendorId, createdAt: { $gte: since30 }, status: { $nin: ['cancelled', 'refunded'] } } },
        { $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
            revenue: { $sum: '$subtotal' }, orders: { $sum: 1 },
        } },
        { $sort: { _id: 1 } },
      ]),
      SubOrder.aggregate([
        { $match: { vendor: vendorId } },
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),
      Product.countDocuments({ vendor: vendorId }),
      Product.countDocuments({ vendor: vendorId, $expr: { $lte: ['$stock', '$alertLevel'] } }),
      SubOrder.find({ vendor: vendorId }).sort({ createdAt: -1 }).limit(5)
        .select('subNumber subtotal vendorEarning status createdAt').lean(),
    ]);

    res.json({
      success: true,
      data: {
        totalRevenue:  totals[0]?.revenue || 0,
        totalEarning:  totals[0]?.earning || 0,
        totalOrders:   totals[0]?.orders || 0,
        productCount,
        lowStockCount: lowStock,
        salesByDay:    last30,
        ordersByStatus: Object.fromEntries(statusCounts.map(s => [s._id, s.count])),
        recentOrders:  recent,
      },
    });
  } catch (err) { next(err); }
};

// ─── Earnings / payouts ──────────────────────────────────────────────────────
//
// Balance model: settledEarning is simply Vendor.totalWithdrawn (a running
// ledger incremented only when an admin marks a WithdrawalRequest paid).
// pendingEarning is the delivered-order earnings not yet withdrawn, minus
// whatever is reserved by an outstanding pending withdrawal request. This
// deliberately does NOT read/write SubOrder.settledAt — that field is legacy
// and unused; per-suborder settlement tracking isn't needed since nobody
// needs to know which specific suborder "paid for" a withdrawal, only totals.

exports.earnings = async (req, res, next) => {
  try {
    const SubOrder          = getSubOrderModel(req.tenantConn);
    const Vendor            = getVendorModel(req.tenantConn);
    const WithdrawalRequest = getWithdrawalRequestModel(req.tenantConn);
    const vendorId = req.vendor._id;
    const { page, limit, skip } = paginate(req);

    const [earningAgg, vendor, pendingRequest, rows, total] = await Promise.all([
      SubOrder.aggregate([
        { $match: { vendor: vendorId, status: 'delivered' } },
        { $group: { _id: null, total: { $sum: '$vendorEarning' } } },
      ]),
      Vendor.findById(vendorId).select('totalWithdrawn').lean(),
      WithdrawalRequest.findOne({ vendor: vendorId, status: 'pending' }).lean(),
      SubOrder.find({ vendor: vendorId, status: 'delivered' })
        .select('subNumber subtotal commissionRate commissionAmount vendorEarning createdAt')
        .sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      SubOrder.countDocuments({ vendor: vendorId, status: 'delivered' }),
    ]);

    const totalEarned          = earningAgg[0]?.total || 0;
    const totalWithdrawn       = vendor?.totalWithdrawn || 0;
    const pendingWithdrawalAmt = pendingRequest?.amount || 0;
    const pendingEarning       = Math.max(0, totalEarned - totalWithdrawn);
    const availableForWithdrawal = Math.max(0, pendingEarning - pendingWithdrawalAmt);

    res.json({
      success: true,
      data: {
        settledEarning:          totalWithdrawn,
        pendingEarning,
        pendingWithdrawalAmount: pendingWithdrawalAmt,
        availableForWithdrawal,
        hasPendingWithdrawal:    !!pendingRequest,
        entries: rows,
      },
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (err) { next(err); }
};

// ─── Withdrawal requests ──────────────────────────────────────────────────────

exports.listWithdrawals = async (req, res, next) => {
  try {
    const WithdrawalRequest = getWithdrawalRequestModel(req.tenantConn);
    const { page, limit, skip } = paginate(req);
    const [rows, total] = await Promise.all([
      WithdrawalRequest.find({ vendor: req.vendor._id }).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      WithdrawalRequest.countDocuments({ vendor: req.vendor._id }),
    ]);
    res.json({ success: true, data: rows, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
  } catch (err) { next(err); }
};

exports.requestWithdrawal = async (req, res, next) => {
  try {
    const WithdrawalRequest = getWithdrawalRequestModel(req.tenantConn);
    const SubOrder          = getSubOrderModel(req.tenantConn);
    const Vendor            = getVendorModel(req.tenantConn);
    const vendorId = req.vendor._id;

    const amt = Number(req.body.amount);
    if (!amt || amt <= 0) {
      return res.status(400).json({ success: false, message: 'Enter a valid amount' });
    }

    const existing = await WithdrawalRequest.exists({ vendor: vendorId, status: 'pending' });
    if (existing) {
      return res.status(409).json({ success: false, message: 'You already have a pending withdrawal request' });
    }

    const [earningAgg] = await SubOrder.aggregate([
      { $match: { vendor: vendorId, status: 'delivered' } },
      { $group: { _id: null, total: { $sum: '$vendorEarning' } } },
    ]);
    const totalEarned    = earningAgg?.total || 0;
    const vendor         = await Vendor.findById(vendorId).select('totalWithdrawn').lean();
    const pendingBalance = Math.max(0, totalEarned - (vendor?.totalWithdrawn || 0));

    if (amt > pendingBalance) {
      return res.status(400).json({ success: false, message: `Amount exceeds available balance (₹${pendingBalance})` });
    }

    const request = await WithdrawalRequest.create({ vendor: vendorId, amount: amt });

    await notifyAdmin(req.tenantConn, req.tenant?.slug, {
      type:    'withdrawal',
      title:   'New Withdrawal Request',
      message: `${req.vendor.storeName} requested a withdrawal of ₹${amt}`,
      link:    `/withdrawals`,
    });

    res.status(201).json({ success: true, data: request });
  } catch (err) { next(err); }
};

// ─── Per-vendor shipment tracking ─────────────────────────────────────────────

exports.trackSubOrder = async (req, res, next) => {
  try {
    const SubOrder = getSubOrderModel(req.tenantConn);
    const subOrder = await SubOrder.findOne({ _id: req.params.id, vendor: req.vendor._id })
      .select('awbCode courierSlug subNumber');
    if (!subOrder) return res.status(404).json({ success: false, message: 'Order not found' });
    if (!subOrder.awbCode) {
      return res.status(400).json({ success: false, message: 'No shipment booked yet for this order' });
    }
    const tracker = subOrder.courierSlug === 'delhivery' ? delhivery : shiprocket;
    const liveTracking = await tracker.trackShipment(subOrder.awbCode).catch(() => null);
    res.json({ success: true, data: { awbCode: subOrder.awbCode, liveTracking } });
  } catch (err) { next(err); }
};
