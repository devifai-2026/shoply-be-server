const crypto = require('crypto');

// AES-256-GCM for tenant secrets (per-tenant Mongo URIs, gateway keys).
// Key: 64-char hex in SECRET_ENC_KEY. Falls back to a JWT_SECRET-derived key
// so dev environments work, but production must set SECRET_ENC_KEY.
const getKey = () => {
  if (process.env.SECRET_ENC_KEY) {
    return Buffer.from(process.env.SECRET_ENC_KEY, 'hex');
  }
  return crypto.createHash('sha256').update(process.env.JWT_SECRET || 'dev').digest();
};

const encrypt = (plain) => {
  if (plain === null || plain === undefined || plain === '') return plain;
  const iv     = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getKey(), iv);
  const enc    = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  return `enc:v1:${iv.toString('base64')}:${cipher.getAuthTag().toString('base64')}:${enc.toString('base64')}`;
};

const decrypt = (stored) => {
  if (!stored || typeof stored !== 'string' || !stored.startsWith('enc:v1:')) return stored;
  const [, , ivB64, tagB64, dataB64] = stored.split(':');
  const decipher = crypto.createDecipheriv('aes-256-gcm', getKey(), Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64')), decipher.final()]).toString('utf8');
};

module.exports = { encrypt, decrypt };
