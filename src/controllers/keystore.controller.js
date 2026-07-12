const crypto = require('crypto');
const os     = require('os');
const path   = require('path');
const fs     = require('fs');
const { execFile } = require('child_process');
const { promisify } = require('util');
const { Keystore } = require('../models/control');

const execFileP = promisify(execFile);

const publicView = (ks) => ks && ({
  name: ks.name,
  fileName: ks.fileName,
  keyAlias: ks.keyAlias,
  fingerprint: ks.fingerprint,
  isActive: ks.isActive,
  hasKeystore: !!ks.keystoreB64,
  updatedAt: ks.updatedAt,
});

// GET /platform/keystore — metadata only, never the key material
exports.get = async (req, res, next) => {
  try {
    const ks = await Keystore.findOne({ isActive: true }).sort({ updatedAt: -1 });
    res.json({ success: true, data: publicView(ks) });
  } catch (err) { next(err); }
};

// POST /platform/keystore/upload — { keystoreB64, storePassword, keyAlias, keyPassword, fileName? }
exports.upload = async (req, res, next) => {
  try {
    const { keystoreB64, storePassword, keyAlias, keyPassword, fileName } = req.body;
    if (!keystoreB64 || !storePassword || !keyAlias || !keyPassword) {
      return res.status(400).json({ success: false, message: 'keystoreB64, storePassword, keyAlias and keyPassword are required' });
    }
    await Keystore.updateMany({}, { isActive: false });
    const ks = await Keystore.create({
      name: 'platform', fileName: fileName || 'release.jks',
      keystoreB64, storePassword, keyAlias, keyPassword, isActive: true,
    });
    res.status(201).json({ success: true, data: publicView(ks), message: 'Keystore saved' });
  } catch (err) { next(err); }
};

// POST /platform/keystore/generate — { keyAlias, storePassword, keyPassword, cn?, org? }
// Generates a fresh release keystore server-side using keytool.
exports.generate = async (req, res, next) => {
  try {
    const { keyAlias = 'release', storePassword, keyPassword, cn = 'Shoply', org = 'Shoply' } = req.body;
    const sp = storePassword || crypto.randomBytes(12).toString('base64url');
    const kp = keyPassword || sp;

    const tmp = path.join(os.tmpdir(), `ks-${crypto.randomBytes(6).toString('hex')}.jks`);
    try {
      await execFileP('keytool', [
        '-genkeypair', '-v',
        '-keystore', tmp,
        '-storetype', 'JKS',
        '-keyalg', 'RSA', '-keysize', '2048', '-validity', '10000',
        '-alias', keyAlias,
        '-storepass', sp, '-keypass', kp,
        '-dname', `CN=${cn}, O=${org}, C=IN`,
      ]);
    } catch (e) {
      return res.status(500).json({ success: false, message: `keytool failed (is a JDK installed on the server?): ${e.message}` });
    }

    const b64 = fs.readFileSync(tmp).toString('base64');
    // fingerprint (best-effort)
    let fingerprint = '';
    try {
      const { stdout } = await execFileP('keytool', ['-list', '-v', '-keystore', tmp, '-storepass', sp, '-alias', keyAlias]);
      fingerprint = (stdout.match(/SHA256:\s*([0-9A-F:]+)/i) || [])[1] || '';
    } catch { /* ignore */ }
    fs.unlinkSync(tmp);

    await Keystore.updateMany({}, { isActive: false });
    const ks = await Keystore.create({
      name: 'platform', fileName: 'release.jks',
      keystoreB64: b64, storePassword: sp, keyAlias, keyPassword: kp, fingerprint, isActive: true,
    });

    // Return the generated passwords ONCE so the owner can record them.
    res.status(201).json({
      success: true,
      data: publicView(ks),
      credentials: { storePassword: sp, keyPassword: kp, keyAlias },
      message: 'Keystore generated — save these credentials, they are shown only once',
    });
  } catch (err) { next(err); }
};

// GET /platform/keystore/material — decrypted keystore + creds for CI.
// Secured by the build secret header (same as build callbacks), NOT owner JWT,
// so a CI job with only the build secret can fetch it.
exports.material = async (req, res, next) => {
  try {
    if (req.headers['x-build-secret'] !== process.env.BUILD_CALLBACK_SECRET) {
      return res.status(401).json({ success: false, message: 'Bad build secret' });
    }
    const ks = await Keystore.findOne({ isActive: true }).sort({ updatedAt: -1 });
    if (!ks || !ks.keystoreB64) return res.status(404).json({ success: false, message: 'No keystore configured' });
    res.json({
      success: true,
      data: {
        fileName:      ks.fileName,
        keystoreB64:   ks.decrypted('keystoreB64'),
        storePassword: ks.decrypted('storePassword'),
        keyAlias:      ks.keyAlias,
        keyPassword:   ks.decrypted('keyPassword'),
      },
    });
  } catch (err) { next(err); }
};
