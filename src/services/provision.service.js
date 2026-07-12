const { Tenant, TenantSecret } = require('../models/control');
const { withDbName } = require('../config/controlDb');

const publicDomain = () =>
  process.env.SAAS_PUBLIC_DOMAIN
  || (process.env.SAAS_ROOT_DOMAIN || '').split(',').map(s => s.trim()).filter(Boolean).pop()
  || 'localhost';

// Computed (not stored) tenant-facing URLs. In this deployment every tenant is
// served from the same host with a slug subdomain on the sslip.io domain.
const tenantUrls = (tenant) => {
  const base = publicDomain();
  const proto = base.includes('localhost') ? 'http' : 'https';
  return {
    store: `${proto}://${tenant.slug}.${base}`,
    admin: `${proto}://${tenant.slug}.admin.${base}`,
    api:   `${proto}://api.${base}`,
  };
};

const withUrls = (t) => {
  const o = t.toObject ? t.toObject() : { ...t };
  o.urls = tenantUrls(o);
  return o;
};

const SLUG_RE = /^[a-z][a-z0-9-]{1,38}[a-z0-9]$/;
const PKG_RE  = /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/;

const slugify = (s) =>
  String(s || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);

// Simplified creation: the owner supplies only the app name, package name,
// brand name and brand logo. Slug, DB, and the tenant admin login are derived
// automatically — the store admin handles everything else afterward.
async function createTenant({ appName, packageName, brandName, brandLogo, mongoUri, primaryColor,
                              // legacy fields still accepted for API compatibility
                              slug: rawSlug, name, branding = {}, android = {} }) {
  const displayName = brandName || appName || branding.displayName || name || '';
  const appLabel    = appName || displayName;
  const packageId   = packageName || android.applicationId;

  let slug = (rawSlug || slugify(brandName || appName || name)).toLowerCase().trim();
  if (!SLUG_RE.test(slug)) {
    throw Object.assign(new Error('Could not derive a valid slug from the brand/app name (3-40 chars)'), { statusCode: 400 });
  }
  if (packageId && !PKG_RE.test(packageId)) {
    throw Object.assign(new Error('Package name must look like com.brand.app'), { statusCode: 400 });
  }
  if (await Tenant.exists({ slug })) {
    throw Object.assign(new Error('A tenant with this slug/brand already exists'), { statusCode: 409 });
  }
  if (packageId && await Tenant.exists({ 'android.applicationId': packageId })) {
    throw Object.assign(new Error('That package name is already in use'), { statusCode: 409 });
  }

  const dbName = `tenant_${slug.replace(/-/g, '_')}`;
  const onDefaultCluster = !mongoUri;

  const tenant = await Tenant.create({
    slug, name: displayName || slug,
    status: 'provisioning',
    dbName, dbOnDefaultCluster: onDefaultCluster,
    branding: {
      displayName:  displayName || slug,
      logoUrl:      brandLogo || branding.logoUrl || '',
      primaryColor: primaryColor || branding.primaryColor || '#6D28D9',
    },
    android: {
      applicationId: packageId || `com.shoply.${slug.replace(/-/g, '')}`,
      appLabel:      appLabel || displayName || slug,
    },
  });

  // Store the effective DB URI (custom or derived) encrypted.
  const effectiveUri = mongoUri || withDbName(process.env.MONGODB_URI, dbName);
  await TenantSecret.create({ tenant: tenant._id, slug, dbUri: effectiveUri });

  tenant.status = 'active';
  await tenant.save();
  return withUrls(tenant);
}

module.exports = { createTenant, tenantUrls, withUrls };
