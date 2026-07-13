// Reads tenant-level premium-addon flags off req.tenant (the control-plane
// Tenant document, already resolved by tenantContext middleware on every
// request). PO Console is the only place that can flip these — never
// self-serve from ecom-admin.
function isAiReviewEnabled(tenant) {
  return !!tenant?.addons?.aiProductReview?.enabled;
}

module.exports = { isAiReviewEnabled };
