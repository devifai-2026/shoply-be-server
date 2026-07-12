const mongoose = require('mongoose');
const { Tenant, TenantSecret } = require('../models/control');
const { withDbName } = require('./controlDb');

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
    conn = mongoose.createConnection(withDbName(uri, tenant.dbName), { maxPoolSize: 5 });
    conn.on('error', (err) => console.error(`[tenantDb:${slug}] connection error:`, err.message));
    // Wait for the connection to actually be usable before caching/returning
    // it — otherwise the first write on a brand-new custom-URI connection can
    // race mongoose's server-selection window and buffer-timeout instead of
    // surfacing a clear connection error.
    await conn.asPromise();
  }

  cache.set(slug, conn);
  return conn;
}

function invalidate(slug) {
  cache.delete(slug);
}

module.exports = { getTenantConnection, invalidate };
