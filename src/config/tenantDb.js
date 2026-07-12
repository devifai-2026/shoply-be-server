const mongoose = require('mongoose');
const { Tenant, TenantSecret } = require('../models/control');

// slug -> mongoose Connection. For same-cluster tenants this is a cheap
// useDb() handle sharing the default connection's pool; Mongoose caches those
// internally too, so this Map mainly matters for custom-URI tenants.
const cache = new Map();

async function getTenantConnection(slug) {
  if (cache.has(slug)) return cache.get(slug);

  const tenant = await Tenant.findOne({ slug, status: { $ne: 'deleted' } });
  if (!tenant) return null;

  let conn;
  if (tenant.dbOnDefaultCluster) {
    conn = mongoose.connection.useDb(tenant.dbName, { useCache: true });
  } else {
    const secret = await TenantSecret.findOne({ tenant: tenant._id });
    const uri = secret && secret.decrypted('dbUri');
    if (!uri) throw new Error(`Tenant ${slug} has no dbUri secret configured`);
    conn = mongoose.createConnection(uri, { maxPoolSize: 5 });
    conn.on('error', (err) => console.error(`[tenantDb:${slug}] connection error:`, err.message));
  }

  cache.set(slug, conn);
  return conn;
}

function invalidate(slug) {
  cache.delete(slug);
}

module.exports = { getTenantConnection, invalidate };
