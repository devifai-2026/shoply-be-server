const crypto = require('crypto');
const { Tenant, TenantSecret, BuildJob, OwnerUser } = require('../models/control');
const { signOwnerToken } = require('../middleware/ownerAuth');
const provision   = require('../services/provision.service');
const buildDispatch = require('../services/buildDispatch.service');
const buildArtifacts = require('../services/buildArtifacts.service');
const metrics     = require('../utils/metrics');
const { getTenantConnection, invalidate: invalidateTenantConn } = require('../config/tenantDb');
const { getAdminModel } = require('../models/Admin');

// ─── Auth ─────────────────────────────────────────────────────────────────────

exports.login = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const owner = await OwnerUser.findOne({ email: (email || '').toLowerCase() }).select('+password');
    if (!owner || !(await owner.matchPassword(password || ''))) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }
    res.json({ success: true, token: signOwnerToken(owner._id), data: { email: owner.email, name: owner.name } });
  } catch (err) { next(err); }
};

// ─── Overview ─────────────────────────────────────────────────────────────────

exports.overview = async (req, res, next) => {
  try {
    const [tenantRows, buildRows] = await Promise.all([
      Tenant.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
      BuildJob.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
    ]);
    const tStat = Object.fromEntries(tenantRows.map(r => [r._id, r.count]));
    const bStat = Object.fromEntries(buildRows.map(r => [r._id, r.count]));
    res.json({
      success: true,
      data: {
        tenants: {
          total:     tenantRows.reduce((s, r) => s + r.count, 0),
          active:    tStat.active || 0,
          suspended: tStat.suspended || 0,
        },
        buildJobs: {
          total:     buildRows.reduce((s, r) => s + r.count, 0),
          queued:    bStat.queued || 0,
          running:   bStat.running || 0,
          succeeded: bStat.succeeded || 0,
          failed:    bStat.failed || 0,
        },
      },
    });
  } catch (err) { next(err); }
};

// ─── Metrics ──────────────────────────────────────────────────────────────────

exports.metrics = async (req, res) => {
  res.json({ success: true, data: metrics.snapshot() });
};

const VALID_WINDOWS = ['24h', '7d', 'month', 'all'];

// Resolve a window key to a { since, apiSeconds } pair.
// - 24h/7d: rolling window ending now
// - month:  from the 1st of the current calendar month
// - all:    from the earliest tenant/build record (entire history)
async function resolveWindow(key) {
  const now = Date.now();
  if (key === '24h') return { since: new Date(now - 86400 * 1000), apiSeconds: 86400 };
  if (key === '7d')  return { since: new Date(now - 7 * 86400 * 1000), apiSeconds: 604800 };
  if (key === 'month') {
    const d = new Date();
    const since = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
    return { since, apiSeconds: Math.ceil((now - since.getTime()) / 1000) };
  }
  // all-time: earliest record in the control plane, floored to 1 day
  const earliest = await Tenant.findOne().sort({ createdAt: 1 }).select('createdAt').lean();
  const since = earliest ? new Date(earliest.createdAt) : new Date(now - 86400 * 1000);
  return { since, apiSeconds: Math.max(86400, Math.ceil((now - since.getTime()) / 1000)) };
}

// Time-series analytics for the line-chart dashboard.
// - api: request/error/latency series from the in-process metrics buffer
// - growth: tenants & build jobs created per day (control-plane, real history)
exports.analytics = async (req, res, next) => {
  try {
    const key = VALID_WINDOWS.includes(req.query.window) ? req.query.window : '24h';
    const { since, apiSeconds } = await resolveWindow(key);

    // In-process request metrics only retain recent samples; cap the API chart
    // window so it never claims data it doesn't have.
    const api = metrics.timeSeries(Math.min(apiSeconds, 7 * 86400));

    const bucketByDay = (rows) => {
      const m = new Map();
      rows.forEach(r => {
        const d = new Date(r.createdAt).toISOString().slice(0, 10);
        m.set(d, (m.get(d) || 0) + 1);
      });
      return m;
    };
    const [tenants, builds] = await Promise.all([
      Tenant.find({ createdAt: { $gte: since } }).select('createdAt').lean(),
      BuildJob.find({ createdAt: { $gte: since } }).select('createdAt').lean(),
    ]);
    const tMap = bucketByDay(tenants);
    const bMap = bucketByDay(builds);

    // Emit one point per day from `since` to today (cap at 400 days for safety).
    const startDay = new Date(since.toISOString().slice(0, 10) + 'T00:00:00Z').getTime();
    const today    = new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00Z').getTime();
    const growth = [];
    for (let t = startDay, n = 0; t <= today && n < 400; t += 86400 * 1000, n++) {
      const d = new Date(t).toISOString().slice(0, 10);
      growth.push({ ts: d, tenants: tMap.get(d) || 0, builds: bMap.get(d) || 0 });
    }

    res.json({ success: true, data: { window: key, api, growth } });
  } catch (err) { next(err); }
};

// ─── Tenants ────────────────────────────────────────────────────────────────

exports.listTenants = async (req, res, next) => {
  try {
    const tenants = await Tenant.find().sort({ createdAt: -1 });
    res.json({ success: true, data: tenants.map(provision.withUrls) });
  } catch (err) { next(err); }
};

exports.getTenant = async (req, res, next) => {
  try {
    const tenant = await Tenant.findOne({ slug: req.params.slug });
    if (!tenant) return res.status(404).json({ success: false, message: 'Tenant not found' });
    res.json({ success: true, data: provision.withUrls(tenant) });
  } catch (err) { next(err); }
};

// POST /platform/tenants/logo-upload — used by the "New tenant" form so the
// owner can upload a logo file instead of pasting a URL. Returns a relative
// URL to be sent as brandLogo when creating the tenant.
exports.uploadTenantLogo = async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded' });
    res.json({ success: true, data: { url: `/uploads/tenants/${req.file.filename}` } });
  } catch (err) { next(err); }
};

exports.createTenant = async (req, res, next) => {
  try {
    const tenant = await provision.createTenant(req.body);
    res.status(201).json({ success: true, data: tenant });
  } catch (err) {
    if (err.statusCode) return res.status(err.statusCode).json({ success: false, message: err.message });
    next(err);
  }
};

const setStatus = (status) => async (req, res, next) => {
  try {
    const tenant = await Tenant.findOneAndUpdate({ slug: req.params.slug }, { status }, { new: true });
    if (!tenant) return res.status(404).json({ success: false, message: 'Tenant not found' });
    res.json({ success: true, data: provision.withUrls(tenant), message: `Tenant ${status}` });
  } catch (err) { next(err); }
};
exports.suspendTenant    = setStatus('suspended');
exports.reactivateTenant = setStatus('active');

// Drops the tenant's database (default-cluster tenants) and removes all
// control-plane records. Does NOT clear Caddy's cached TLS cert for the
// tenant's subdomains — that's owned by the caddy system user, out of this
// process's reach; clear it out-of-band (see provision.service.js comment)
// or the subdomain's URL stays "live" (dead page, stale cert) until Caddy
// naturally lets the cert expire.
exports.deleteTenant = async (req, res, next) => {
  try {
    const deleted = await provision.deleteTenant(req.params.slug);
    if (!deleted) return res.status(404).json({ success: false, message: 'Tenant not found' });
    res.json({
      success: true,
      message: 'Tenant deleted. Cached TLS certs for its subdomains must be cleared separately.',
    });
  } catch (err) { next(err); }
};

exports.rotateSecrets = async (req, res, next) => {
  try {
    const tenant = await Tenant.findOne({ slug: req.params.slug });
    if (!tenant) return res.status(404).json({ success: false, message: 'Tenant not found' });
    const { mongoUri } = req.body;
    await TenantSecret.findOneAndUpdate(
      { tenant: tenant._id },
      { dbUri: mongoUri, slug: tenant.slug },
      { upsert: true },
    );
    tenant.dbOnDefaultCluster = !mongoUri;
    await tenant.save();
    invalidateTenantConn(tenant.slug);
    res.json({ success: true, message: 'Tenant DB URI rotated' });
  } catch (err) { next(err); }
};

// GET /platform/tenants/:slug/admin-credentials — reveal the store-admin login.
exports.getAdminCredentials = async (req, res, next) => {
  try {
    const tenant = await Tenant.findOne({ slug: req.params.slug });
    if (!tenant) return res.status(404).json({ success: false, message: 'Tenant not found' });
    const secret = await TenantSecret.findOne({ tenant: tenant._id });
    if (!secret || !secret.adminEmail) {
      return res.status(404).json({ success: false, message: 'No admin credentials on record for this tenant' });
    }
    res.json({
      success: true,
      data: { email: secret.adminEmail, password: secret.decrypted('adminPasswordEnc') },
    });
  } catch (err) { next(err); }
};

// POST /platform/tenants/:slug/admin-credentials/rotate — generate (or create,
// if none exists yet) the store-admin login and return the plaintext once.
exports.rotateAdminCredentials = async (req, res, next) => {
  try {
    const tenant = await Tenant.findOne({ slug: req.params.slug });
    if (!tenant) return res.status(404).json({ success: false, message: 'Tenant not found' });

    const secret = await TenantSecret.findOne({ tenant: tenant._id });
    const email = secret?.adminEmail || `admin@${tenant.slug}.local`;
    const newPassword = crypto.randomBytes(9).toString('base64url');

    const conn = await getTenantConnection(tenant.slug);
    const Admin = getAdminModel(conn);
    let admin = await Admin.findOne({ email });
    if (admin) { admin.password = newPassword; await admin.save(); }
    else { admin = await Admin.create({ name: 'Store Admin', email, password: newPassword, role: 'superadmin' }); }

    await TenantSecret.findOneAndUpdate(
      { tenant: tenant._id },
      { slug: tenant.slug, adminEmail: email, adminPasswordEnc: newPassword },
      { upsert: true },
    );

    res.json({
      success: true,
      data: { email, password: newPassword },
      message: 'Admin credentials rotated — shown only once',
    });
  } catch (err) { next(err); }
};

// ─── Builds ─────────────────────────────────────────────────────────────────

exports.queueBuild = async (req, res, next) => {
  try {
    const tenant = await Tenant.findOne({ slug: req.params.slug });
    if (!tenant) return res.status(404).json({ success: false, message: 'Tenant not found' });

    const artifact = req.body.artifact === 'aab' ? 'aab' : 'apk';
    // 'buyer' (default) or 'seller' — each app has its own package id + repo.
    const app = req.body.app === 'seller' ? 'seller' : 'buyer';

    const isSeller = app === 'seller';
    const applicationId = isSeller
      ? (tenant.androidSeller?.applicationId || `${tenant.android.applicationId}.seller`)
      : tenant.android.applicationId;
    const appLabel = isSeller
      ? (tenant.androidSeller?.appLabel || `${tenant.android.appLabel} Seller`)
      : tenant.android.appLabel;

    const last = await BuildJob.findOne({ tenant: tenant.slug, app }).sort({ versionCode: -1 });
    const versionCode = (last?.versionCode || 0) + 1;

    const job = await BuildJob.create({
      tenant:        tenant.slug,
      app,
      artifact,
      applicationId,
      appLabel,
      apiBase:       provision.tenantUrls(tenant).api,
      versionName:   `1.0.${versionCode}`,
      versionCode,
      status:        'queued',
    });

    try {
      const result = await buildDispatch.dispatch(job);
      if (result.dispatched) { job.status = 'dispatched'; await job.save(); }
      else { job.error = result.reason; await job.save(); }
    } catch (e) {
      job.status = 'failed'; job.error = e.message; await job.save();
    }

    res.status(201).json({ success: true, data: job });
  } catch (err) { next(err); }
};

exports.listBuilds = async (req, res, next) => {
  try {
    const filter = {};
    if (req.query.tenant) filter.tenant = req.query.tenant;
    const jobs = await BuildJob.find(filter).sort({ createdAt: -1 }).limit(100);
    res.json({ success: true, data: jobs });
  } catch (err) { next(err); }
};

// Owner-authenticated: return a short-lived signed download URL for a build's
// private GCS artifact.
exports.buildDownload = async (req, res, next) => {
  try {
    const job = await BuildJob.findById(req.params.id);
    if (!job || job.status !== 'succeeded') {
      return res.status(404).json({ success: false, message: 'No downloadable artifact' });
    }
    if (job.artifactObject && job.artifactBucket) {
      const url = await buildArtifacts.signedDownloadUrl(job.artifactBucket, job.artifactObject, 900);
      return res.json({ success: true, data: { url, expiresIn: 900 } });
    }
    // Legacy public URL fallback
    if (job.artifactUrl) return res.json({ success: true, data: { url: job.artifactUrl } });
    res.status(404).json({ success: false, message: 'Artifact location unknown' });
  } catch (err) { next(err); }
};

// Called by CI (secret-authenticated, not owner-JWT)
exports.buildCallback = async (req, res, next) => {
  try {
    if (req.headers['x-build-secret'] !== process.env.BUILD_CALLBACK_SECRET) {
      return res.status(401).json({ success: false, message: 'Bad build secret' });
    }
    const { status, artifactUrl, artifactBucket, artifactObject, error } = req.body;
    const ok = status === 'succeeded';
    const job = await BuildJob.findByIdAndUpdate(req.params.id, {
      status: ok ? 'succeeded' : 'failed',
      artifactUrl: artifactUrl || '',
      artifactBucket: artifactBucket || '',
      artifactObject: artifactObject || '',
      error: error || '',
    }, { new: true });

    // On success, delete older APK/AAB versions for this tenant+app so only the
    // latest artifact and its download URL remain.
    if (ok && job) {
      buildArtifacts.pruneSuperseded(job).catch(e =>
        console.error('[buildCallback] prune failed:', e.message));
    }
    res.json({ success: true });
  } catch (err) { next(err); }
};
