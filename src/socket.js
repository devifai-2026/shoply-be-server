const { Server } = require('socket.io');
const jwt        = require('jsonwebtoken');
const metrics    = require('./utils/metrics');

let adminNsp  = null;
let vendorNsp = null;

// Realtime layer. /owner streams API metrics to the PO console. /admin and
// /vendor push live notifications/moderation events to each tenant's own
// admin panel and seller portal — room-per-tenant (and, for vendors,
// room-per-vendor-within-tenant) since this is a single Node process
// serving many tenant databases; without rooms an event for one tenant
// would broadcast to every connected socket across every tenant.
function initSocket(httpServer) {
  const io = new Server(httpServer, {
    cors: { origin: true, credentials: true },
  });

  const jwtSecret    = process.env.JWT_SECRET;
  const ownerSecret  = process.env.OWNER_JWT_SECRET || process.env.JWT_SECRET;

  const owner = io.of('/owner');
  owner.use((socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      const decoded = jwt.verify(token, ownerSecret);
      if (decoded.role !== 'owner') return next(new Error('unauthorized'));
      next();
    } catch {
      next(new Error('unauthorized'));
    }
  });
  owner.on('connection', (socket) => {
    socket.emit('metrics', metrics.snapshot());
  });

  // Push a fresh metrics rollup to all connected owners every 5s.
  setInterval(() => {
    if (owner.sockets.size) owner.emit('metrics', metrics.snapshot());
  }, 5000);

  adminNsp = io.of('/admin');
  adminNsp.use((socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      const decoded = jwt.verify(token, jwtSecret);
      if (!decoded.slug) return next(new Error('unauthorized')); // admin tokens always carry a tenant slug
      socket.tenantSlug = decoded.slug;
      next();
    } catch {
      next(new Error('unauthorized'));
    }
  });
  adminNsp.on('connection', (socket) => {
    socket.join(`tenant:${socket.tenantSlug}`);
  });

  vendorNsp = io.of('/vendor');
  vendorNsp.use((socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      const decoded = jwt.verify(token, jwtSecret);
      if (decoded.role !== 'vendor' || !decoded.slug) return next(new Error('unauthorized'));
      socket.tenantSlug = decoded.slug;
      socket.vendorId   = decoded.id;
      next();
    } catch {
      next(new Error('unauthorized'));
    }
  });
  vendorNsp.on('connection', (socket) => {
    socket.join(`tenant:${socket.tenantSlug}:vendor:${socket.vendorId}`);
  });

  metrics.setIo(io);
  return io;
}

// Safe to call even before initSocket() has run (e.g. during tests) —
// silently no-ops rather than throwing, since a missed live-push event is
// non-fatal (the UI still catches up on next poll/page-load).
function emitToAdmin(tenantSlug, event, payload) {
  if (!adminNsp) return;
  adminNsp.to(`tenant:${tenantSlug}`).emit(event, payload);
}

function emitToVendor(tenantSlug, vendorId, event, payload) {
  if (!vendorNsp) return;
  vendorNsp.to(`tenant:${tenantSlug}:vendor:${vendorId}`).emit(event, payload);
}

module.exports = { initSocket, emitToAdmin, emitToVendor };
