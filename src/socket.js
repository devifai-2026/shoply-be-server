const { Server } = require('socket.io');
const jwt        = require('jsonwebtoken');
const metrics    = require('./utils/metrics');

// Realtime layer. The /owner namespace streams API metrics to the PO console;
// /admin and /vendor are reserved for live order/preview push.
function initSocket(httpServer) {
  const io = new Server(httpServer, {
    cors: { origin: true, credentials: true },
  });

  const ownerSecret = process.env.OWNER_JWT_SECRET || process.env.JWT_SECRET;

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

  metrics.setIo(io);
  return io;
}

module.exports = { initSocket };
