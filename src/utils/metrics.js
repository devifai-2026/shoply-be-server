// In-process API metrics: a ring buffer of per-request samples plus rollups.
// Feeds the PO console's realtime dashboards. No DB writes on the hot path.
const RING_SIZE = 5000;
const ring = [];
let cursor = 0;
const startedAt = Date.now();

let io = null; // Socket.IO server, set by socket layer
const setIo = (server) => { io = server; };

const record = ({ route, method, status, ms }) => {
  const sample = { route, method, status, ms, at: Date.now() };
  ring[cursor] = sample;
  cursor = (cursor + 1) % RING_SIZE;
  if (io) {
    io.of('/owner').emit('activity', { type: 'request', route, status, ms, at: sample.at });
  }
};

const samples = () => ring.filter(Boolean);

const snapshot = (windowSeconds = 900) => {
  const cutoff = Date.now() - windowSeconds * 1000;
  const recent = samples().filter(s => s.at >= cutoff);

  // requests per minute
  const perMin = new Map();
  for (const s of recent) {
    const d = new Date(s.at);
    const key = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    const b = perMin.get(key) || { minute: key, count: 0, errors: 0, totalMs: 0 };
    b.count++; b.totalMs += s.ms;
    if (s.status >= 400) b.errors++;
    perMin.set(key, b);
  }
  const requestsPerMin = [...perMin.values()]
    .map(b => ({ minute: b.minute, count: b.count, errors: b.errors, avgMs: Math.round(b.totalMs / b.count) }));

  // top endpoints
  const byRoute = new Map();
  for (const s of recent) {
    const b = byRoute.get(s.route) || { route: s.route, count: 0, errors: 0, totalMs: 0 };
    b.count++; b.totalMs += s.ms;
    if (s.status >= 400) b.errors++;
    byRoute.set(s.route, b);
  }
  const topEndpoints = [...byRoute.values()]
    .sort((a, b) => b.count - a.count).slice(0, 12)
    .map(b => ({ route: b.route, count: b.count, errors: b.errors, avgMs: Math.round(b.totalMs / b.count) }));

  // status classes
  const statusCounts = { '2xx': 0, '3xx': 0, '4xx': 0, '5xx': 0 };
  for (const s of recent) {
    const cls = `${Math.floor(s.status / 100)}xx`;
    if (statusCounts[cls] !== undefined) statusCounts[cls]++;
  }

  const mem = process.memoryUsage();
  return {
    windowSeconds,
    requestsPerMin,
    topEndpoints,
    statusCounts,
    uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
    memory: { rss: mem.rss, heapUsed: mem.heapUsed },
  };
};

const percentile = (sorted, p) => {
  if (!sorted.length) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx];
};

// Bucketed time-series for line charts (extraaedge style). windowSeconds picks
// both range and bucket size; returns [{ ts, requests, errors, avgMs, p95Ms }].
const timeSeries = (windowSeconds = 3600) => {
  const bucketMs = windowSeconds <= 3600 ? 60_000        // <=1h → per-minute
    : windowSeconds <= 21600 ? 300_000                   // <=6h → 5-min
    : 3_600_000;                                         // else → hourly
  const now = Date.now();
  const cutoff = now - windowSeconds * 1000;
  const recent = samples().filter(s => s.at >= cutoff);

  const buckets = new Map();
  for (const s of recent) {
    const key = Math.floor(s.at / bucketMs) * bucketMs;
    const b = buckets.get(key) || { ts: key, requests: 0, errors: 0, totalMs: 0, latencies: [] };
    b.requests++; b.totalMs += s.ms; b.latencies.push(s.ms);
    if (s.status >= 400) b.errors++;
    buckets.set(key, b);
  }

  // Emit every bucket in range (including empty ones) so the line is continuous.
  const out = [];
  for (let t = Math.floor(cutoff / bucketMs) * bucketMs; t <= now; t += bucketMs) {
    const b = buckets.get(t);
    if (b) {
      const sorted = b.latencies.sort((a, z) => a - z);
      out.push({
        ts: new Date(t).toISOString(),
        requests: b.requests,
        errors: b.errors,
        avgMs: Math.round(b.totalMs / b.requests),
        p95Ms: Math.round(percentile(sorted, 95)),
      });
    } else {
      out.push({ ts: new Date(t).toISOString(), requests: 0, errors: 0, avgMs: 0, p95Ms: 0 });
    }
  }
  return { windowSeconds, bucketMs, series: out };
};

// Express middleware — normalizes route to the mounted path pattern
const middleware = (req, res, next) => {
  const start = process.hrtime.bigint();
  res.on('finish', () => {
    const ms = Number(process.hrtime.bigint() - start) / 1e6;
    const route = (req.baseUrl || '') + (req.route?.path || req.path || '');
    record({ route: route || req.originalUrl.split('?')[0], method: req.method, status: res.statusCode, ms: Math.round(ms) });
  });
  next();
};

module.exports = { middleware, snapshot, timeSeries, setIo };
