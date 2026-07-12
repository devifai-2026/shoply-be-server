const jwt   = require('jsonwebtoken');
const geoip = require('geoip-lite');
const { UAParser } = require('ua-parser-js');
const Visit = require('../models/Visit');

const getClientIp = (req) => {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) return forwarded.split(',')[0].trim();
  return req.ip;
};

// Best-effort — attaches the customer id if a valid token is present, but never blocks the request
const getOptionalCustomerId = (req) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
    const decoded = jwt.verify(authHeader.split(' ')[1], process.env.JWT_SECRET);
    return decoded.id || null;
  } catch {
    return null;
  }
};

exports.recordEvent = async (req, res) => {
  // Always respond immediately — tracking must never block or error out the client
  res.status(202).json({ success: true });

  try {
    const { visitorId, sessionId, eventType, path, productId, platform, referrer } = req.body;
    if (!visitorId || !eventType) return;

    const ip     = getClientIp(req);
    const geo    = geoip.lookup(ip) || {};
    const parsed = new UAParser(req.headers['user-agent'] || '').getResult();

    await Visit.create({
      visitorId,
      sessionId: sessionId || null,
      ip,
      geo: {
        country: geo.country || null,
        region:  geo.region  || null,
        city:    geo.city    || null,
        lat:     geo.ll ? geo.ll[0] : null,
        lng:     geo.ll ? geo.ll[1] : null,
      },
      device: {
        browser:    parsed.browser?.name || null,
        os:         parsed.os?.name || null,
        deviceType: parsed.device?.type || 'desktop',
      },
      platform: platform === 'App' ? 'App' : 'Web',
      eventType,
      path: path || null,
      product: productId || null,
      customer: getOptionalCustomerId(req),
      referrer: referrer || null,
    });
  } catch (err) {
    // Swallow — tracking is best-effort and non-critical
    console.error('Tracking error:', err.message);
  }
};
