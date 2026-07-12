const jwt = require('jsonwebtoken');
const { OwnerUser } = require('../models/control');

const OWNER_SECRET = () => process.env.OWNER_JWT_SECRET || process.env.JWT_SECRET;

// Platform-owner (SaaS) tier — separate secret from tenant JWTs so an owner
// token can't be used against tenant APIs and vice versa.
const protectOwner = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, message: 'No token provided' });
    }
    const decoded = jwt.verify(authHeader.split(' ')[1], OWNER_SECRET());
    if (decoded.role !== 'owner') {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }
    const owner = await OwnerUser.findById(decoded.id);
    if (!owner) return res.status(401).json({ success: false, message: 'Unauthorized' });
    req.owner = owner;
    next();
  } catch (err) {
    if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
      return res.status(401).json({ success: false, message: 'Invalid token' });
    }
    next(err);
  }
};

const signOwnerToken = (id) =>
  jwt.sign({ id, role: 'owner' }, OWNER_SECRET(), { expiresIn: '7d' });

module.exports = { protectOwner, signOwnerToken };
