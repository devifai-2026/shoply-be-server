const express    = require('express');
const helmet     = require('helmet');
const cors       = require('cors');
const morgan     = require('morgan');
const rateLimit  = require('express-rate-limit');
const path       = require('path');

const { errorHandler, notFound } = require('./middleware/errorHandler');
const routes                     = require('./routes');
const metrics                    = require('./utils/metrics');
const platformRoutes             = require('./routes/platform.routes');
const tenantContext              = require('./middleware/tenantContext');

const app = express();

// Trust reverse proxy / CDN so req.ip reflects the real client IP
app.set('trust proxy', true);

// Security headers
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));

// CORS — allow all origins
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// Request logging
if (process.env.NODE_ENV !== 'test') app.use(morgan('dev'));

// Body parsers
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Resolves req.tenant/req.tenantConn from the request's hostname (tenant
// subdomains only — platform hosts and unmatched hosts no-op).
app.use(tenantContext);

// Rate limiting
const limiter = rateLimit({ 
  windowMs: 15 * 60 * 1000, 
  max: 1000, // Increased for development
  standardHeaders: true, 
  legacyHeaders: false,
  message: 'Too many requests from this IP, please try again after 15 minutes'
});
app.use('/api', limiter);

// Per-request API metrics (feeds the PO console realtime dashboards)
app.use('/api', metrics.middleware);

// Static files (uploaded images)
app.use('/uploads', express.static(path.join(__dirname, '..', process.env.UPLOAD_DIR || 'uploads')));

// Platform (SaaS owner) control plane — separate auth tier, control-plane DB
app.use('/api/platform', platformRoutes);

// API routes
app.use('/api', routes);

// Caddy on-demand TLS gate: only issue certs for the root domain, the fixed
// platform hosts, or a subdomain whose slug maps to a real tenant.
app.get('/internal/tls-check', async (req, res) => {
  try {
    const host = (req.query.domain || '').toLowerCase();
    const root = (process.env.SAAS_PUBLIC_DOMAIN || '').toLowerCase();
    if (!host || !root) return res.sendStatus(400);

    const fixed = ['', 'admin.', 'seller.', 'console.', 'api.'].map(p => `${p}${root}`);
    if (fixed.includes(host)) return res.sendStatus(200);

    if (host.endsWith(`.${root}`)) {
      // slug is the left-most label of <slug>.<root> or <slug>.admin.<root>
      const label = host.slice(0, -1 * (`.${root}`).length).replace(/\.admin$/, '');
      const slug = label.split('.')[0];
      const { Tenant } = require('./models/control');
      if (await Tenant.exists({ slug, status: { $ne: 'deleted' } })) return res.sendStatus(200);
    }
    return res.sendStatus(404);
  } catch {
    return res.sendStatus(500);
  }
});

// Health check
app.get('/', (_req, res) => res.json({ status: 'ok', message: "Welcome To Vyaparcart" }));

app.get('/health', (_req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

// 404 + error handler
app.use(notFound);
app.use(errorHandler);

module.exports = app;
