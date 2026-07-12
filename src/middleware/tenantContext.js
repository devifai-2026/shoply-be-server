const { getTenantConnection } = require('../config/tenantDb');
const { Tenant } = require('../models/control');

const ROOT = (process.env.SAAS_PUBLIC_DOMAIN || '').toLowerCase();
const FIXED_PREFIXES = ['', 'admin.', 'seller.', 'console.', 'api.'];

// Same slug-extraction logic as app.js's /internal/tls-check: pulls the slug
// out of <slug>.<root>, <slug>.admin.<root>, or <slug>.seller.<root>; returns
// null for fixed platform hosts or anything that isn't a tenant subdomain.
function extractSlug(host) {
  if (!host || !ROOT) return null;
  const h = host.toLowerCase();
  if (FIXED_PREFIXES.some((p) => `${p}${ROOT}` === h)) return null;
  if (!h.endsWith(`.${ROOT}`)) return null;
  const label = h.slice(0, -1 * `.${ROOT}`.length).replace(/\.(admin|seller)$/, '');
  return label.split('.')[0] || null;
}

// Resolves req.tenant / req.tenantConn from the request's Host header. Never
// blocks the request when no tenant resolves — downstream auth falls back to
// the default connection, which preserves today's single shared admin login.
async function tenantContext(req, res, next) {
  try {
    const host = (req.headers.host || '').split(':')[0];
    const slug = extractSlug(host);
    if (!slug) return next();

    const tenant = await Tenant.findOne({ slug, status: { $ne: 'deleted' } });
    if (!tenant) return next();

    if (tenant.status === 'suspended') {
      return res.status(403).json({ success: false, message: 'This store is suspended' });
    }

    req.tenant = tenant;
    req.tenantConn = await getTenantConnection(slug);
    next();
  } catch (err) {
    next(err);
  }
}

module.exports = tenantContext;
