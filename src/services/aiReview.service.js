const { getProductModel } = require('../models/Product');
const vertexAiService = require('./vertexAi.service');
const { notifyAdmin } = require('../utils/notify');
const { emitToVendor } = require('../socket');

// Runs the AI moderation check for a just-created (or re-submitted)
// product and applies the resulting verdict. Always reads the current
// saved prompt fresh from the control-plane DB — never cached in
// application code — so an owner's prompt edit in PO Console takes effect
// on the very next call, with no redeploy.
//
// wasAutoApproved: true when the vendor has Vendor.autoApprove on and the
// product is therefore ALREADY live (status:'active') by the time this
// runs — AI acts purely as a safety net in that case (confirmed decision):
// an 'approve' verdict is a silent no-op, a 'flag' verdict immediately
// pulls the listing back to draft rather than leaving a flagged item
// purchasable until a human intervenes.
async function reviewProduct(product, { tenantConn, tenantSlug, wasAutoApproved }) {
  const { AiPrompt } = require('../models/control'); // lazy require: avoids a hard control-DB dependency at module-load time for callers that never hit this path
  const Product = getProductModel(tenantConn);

  const promptDoc = await AiPrompt.findOne({ key: 'product_review' }).lean();
  const prompt = promptDoc?.prompt?.trim();
  if (!prompt) {
    // No prompt configured yet — fail safe toward manual review rather
    // than silently skipping the check or guessing at a hardcoded prompt.
    await Product.findByIdAndUpdate(product._id, {
      moderationStatus: 'flagged',
      moderationNote: 'AI review is enabled but no prompt has been configured yet in PO Console.',
      'aiReview.checkedAt': new Date(),
    });
    if (wasAutoApproved) await Product.findByIdAndUpdate(product._id, { status: 'draft' });
    return;
  }

  const catalogSample = await Product.find({ vendor: product.vendor, status: 'active', _id: { $ne: product._id } })
    .select('name category').populate('category', 'name').limit(10).lean();

  const result = await vertexAiService.analyzeProduct({ prompt, product, catalogSample });

  const update = {
    'aiReview.checkedAt': new Date(),
    'aiReview.confidence': result.confidence,
    'aiReview.raw': result.raw,
  };

  if (result.verdict === 'approve') {
    update.moderationStatus = 'ai_approved';
    if (!wasAutoApproved) update.status = 'active'; // publish now — it wasn't live yet
    // else: already active, safety-net check passed silently, nothing more to do
  } else {
    update.moderationStatus = 'flagged';
    update.moderationNote = result.reason;
    if (wasAutoApproved) update.status = 'draft'; // pull an already-live listing back immediately
  }

  await Product.findByIdAndUpdate(product._id, update);

  if (result.verdict !== 'approve') {
    await notifyAdmin(tenantConn, tenantSlug, {
      type: 'vendor',
      title: 'Product flagged by AI review',
      message: `"${product.name}" was flagged for manual review: ${result.reason}`,
      link: `/products?moderation=flagged`,
    });
    if (wasAutoApproved) {
      emitToVendor(tenantSlug, String(product.vendor), 'product:unpublished', {
        productId: String(product._id), name: product.name, reason: result.reason,
      });
    }
  } else if (!wasAutoApproved) {
    emitToVendor(tenantSlug, String(product.vendor), 'product:approved', {
      productId: String(product._id), name: product.name, via: 'ai',
    });
  }
}

module.exports = { reviewProduct };
