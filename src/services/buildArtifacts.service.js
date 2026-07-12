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

module.exports = { pruneSuperseded, deleteGcsObject };
