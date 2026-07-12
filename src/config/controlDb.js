const mongoose = require('mongoose');

// Control plane (SaaS): tenants, secrets, build jobs, owner users live in a
// dedicated database, separate from any tenant's commerce data.
let conn = null;

const withDbName = (uri, dbName) => {
  const [base, query] = uri.split('?');
  const trimmed = base.replace(/\/[^/]*$/, '');
  return `${trimmed}/${dbName}${query ? `?${query}` : ''}`;
};

const getControlDb = () => {
  if (conn) return conn;
  const uri = process.env.SAAS_CONTROL_DB_URI
    || withDbName(process.env.MONGODB_URI, 'saas_control');
  conn = mongoose.createConnection(uri, { maxPoolSize: 5 });
  conn.on('error', (err) => console.error('[ControlDB] connection error:', err.message));
  return conn;
};

module.exports = { getControlDb, withDbName };
