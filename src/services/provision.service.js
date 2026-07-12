const crypto = require('crypto');
const { Tenant, TenantSecret } = require('../models/control');
const { withDbName } = require('../config/controlDb');
const { getTenantConnection } = require('../config/tenantDb');
const { getAdminModel } = require('../models/Admin');

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

  // Seed the store-admin login inside the tenant's own database.
  const adminEmail = `admin@${slug}.local`;
  const adminPassword = crypto.randomBytes(9).toString('base64url');
  const tenantConn = await getTenantConnection(slug);
  const Admin = getAdminModel(tenantConn);
  await Admin.create({ name: 'Store Admin', email: adminEmail, password: adminPassword, role: 'superadmin' });
  await TenantSecret.findOneAndUpdate(
    { tenant: tenant._id },
    { adminEmail, adminPasswordEnc: adminPassword },
  );

  tenant.status = 'active';
  await tenant.save();

  const result = withUrls(tenant);
  result.adminCredentials = { email: adminEmail, password: adminPassword };
  return result;
}

// Fully removes a tenant: drops its database (if on the default cluster —
// custom-URI tenants own their own external cluster, so we only disconnect,
// never drop someone else's database), then removes its control-plane
// records. Does NOT touch Caddy's cached TLS certs for the tenant's
// subdomains — those are owned by the caddy system user and must be cleared
// out-of-band (delete the cert dir under
// /var/lib/caddy/.local/share/caddy/certificates/... and restart caddy), or
// the subdomain keeps resolving to a dead/stale cert until Caddy's own
// on-demand re-check eventually rejects it.
async function deleteTenant(slug) {
  const { BuildJob } = require('../models/control');
  const { getTenantConnection, invalidate } = require('../config/tenantDb');

  const tenant = await Tenant.findOne({ slug });
  if (!tenant) return false;

  const conn = await getTenantConnection(slug);
  if (conn && tenant.dbOnDefaultCluster) {
    await conn.dropDatabase();
  } else if (conn) {
    await conn.close();
  }
  invalidate(slug);

  await TenantSecret.deleteOne({ tenant: tenant._id });
  await BuildJob.deleteMany({ tenant: slug });
  await Tenant.deleteOne({ _id: tenant._id });
  return true;
}

module.exports = { createTenant, deleteTenant, tenantUrls, withUrls };
