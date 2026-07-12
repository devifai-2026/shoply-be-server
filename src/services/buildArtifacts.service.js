const { BuildJob } = require('../models/control');

// Delete a public GCS object via the JSON API using the VM's attached service
// account (metadata-server token). Best-effort — logs and swallows failures so
// build bookkeeping never breaks on a storage hiccup.
async function deleteGcsObject(gcsUrl) {
  const m = /storage\.googleapis\.com\/([^/]+)\/(.+)$/.exec(gcsUrl || '');
  if (!m) return false;
  const [, bucket, object] = m;
  try {
    const tokenRes = await fetch(
      'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token',
      { headers: { 'Metadata-Flavor': 'Google' } },
    );
    if (!tokenRes.ok) return false;
    const { access_token } = await tokenRes.json();
    const del = await fetch(
      `https://storage.googleapis.com/storage/v1/b/${bucket}/o/${encodeURIComponent(object)}`,
      { method: 'DELETE', headers: { Authorization: `Bearer ${access_token}` } },
    );
    return del.ok || del.status === 404;
  } catch (err) {
    console.error('[buildArtifacts] GCS delete failed:', err.message);
    return false;
  }
}

// Keep only the newest succeeded artifact per (tenant, app, artifact); delete
// the older GCS objects and their BuildJob rows.
async function pruneSuperseded(job) {
  const older = await BuildJob.find({
    tenant: job.tenant,
    app: job.app,
    artifact: job.artifact,
    status: 'succeeded',
    _id: { $ne: job._id },
  }).sort({ createdAt: -1 });

  for (const old of older) {
    if (old.artifactUrl) await deleteGcsObject(old.artifactUrl);
    await BuildJob.findByIdAndDelete(old._id);
  }
  return older.length;
}

// Fetch the VM's default service account email + an access token from the
// metadata server (used for IAM-based URL signing — no key file on disk).
async function metadata(path) {
  const res = await fetch(`http://metadata.google.internal/computeMetadata/v1/${path}`,
    { headers: { 'Metadata-Flavor': 'Google' } });
  if (!res.ok) throw new Error(`metadata ${path} -> ${res.status}`);
  return res.text();
}

// Generate a V4 signed GET URL for a private GCS object, valid for `expiresSec`.
// Signs the canonical request via the IAM Credentials signBlob API using the
// VM's attached service account, so no private key ever lives on the box.
async function signedDownloadUrl(bucket, object, expiresSec = 900) {
  const crypto = require('crypto');
  const saEmail = (await metadata('instance/service-accounts/default/email')).trim();
  const tokenJson = JSON.parse(await metadata('instance/service-accounts/default/token'));
  const accessToken = tokenJson.access_token;

  const host = `${bucket}.storage.googleapis.com`;
  const now = new Date();
  const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const date = stamp.slice(0, 8);
  const credentialScope = `${date}/auto/storage/goog4_request`;
  const credential = `${saEmail}/${credentialScope}`;

  const canonicalUri = '/' + object.split('/').map(encodeURIComponent).join('/');
  const params = new URLSearchParams({
    'X-Goog-Algorithm': 'GOOG4-RSA-SHA256',
    'X-Goog-Credential': credential,
    'X-Goog-Date': stamp,
    'X-Goog-Expires': String(expiresSec),
    'X-Goog-SignedHeaders': 'host',
  });
  // URLSearchParams sorts insertion order, not lexicographic — GCS needs sorted.
  const sortedQs = [...params.entries()].sort((a, b) => a[0].localeCompare(b[0]))
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');

  const canonicalRequest = [
    'GET', canonicalUri, sortedQs,
    `host:${host}\n`, 'host', 'UNSIGNED-PAYLOAD',
  ].join('\n');
  const hash = crypto.createHash('sha256').update(canonicalRequest).digest('hex');
  const stringToSign = ['GOOG4-RSA-SHA256', stamp, credentialScope, hash].join('\n');

  // Sign via IAM Credentials signBlob
  const signRes = await fetch(
    `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${saEmail}:signBlob`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ payload: Buffer.from(stringToSign).toString('base64') }),
    },
  );
  if (!signRes.ok) throw new Error(`signBlob failed: ${signRes.status} ${await signRes.text()}`);
  const { signedBlob } = await signRes.json();
  const signature = Buffer.from(signedBlob, 'base64').toString('hex');

  return `https://${host}${canonicalUri}?${sortedQs}&X-Goog-Signature=${signature}`;
}

module.exports = { pruneSuperseded, deleteGcsObject, signedDownloadUrl };
