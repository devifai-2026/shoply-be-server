// Dispatch a tenant APK/AAB build by triggering a GitHub Actions
// workflow_dispatch. The workflow injects the tenant's app id/label/api base
// via --dart-define / -Ptenant.* and uploads the artifact to GCS, then calls
// back POST /api/platform/builds/:id/callback.
async function dispatch(job) {
  // Buyer and seller apps live in separate repos, each with its own
  // tenant-build workflow.
  const repo = job.app === 'seller'
    ? (process.env.GITHUB_SELLER_REPO || 'devifai-2026/shoply-seller-apk')
    : (process.env.GITHUB_USER_REPO   || 'devifai-2026/shoply');
  const token    = process.env.GITHUB_BUILD_TOKEN;
  const workflow = process.env.GITHUB_BUILD_WORKFLOW || 'tenant-build.yml';
  const callbackBase = process.env.BUILD_CALLBACK_BASE || '';

  if (!repo || !token) {
    // No CI configured (dev) — leave the job queued and let the operator run
    // the build manually. Surface why in the job.
    return { dispatched: false, reason: 'GITHUB_BUILD_TOKEN/GITHUB_USER_REPO not configured' };
  }

  const res = await fetch(
    `https://api.github.com/repos/${repo}/actions/workflows/${workflow}/dispatches`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ref: process.env.GITHUB_BUILD_REF || 'main',
        inputs: {
          job_id:         String(job._id),
          tenant:         job.tenant,
          app:            job.app,
          artifact:       job.artifact,
          application_id: job.applicationId,
          app_label:      job.appLabel,
          version_name:   job.versionName,
          version_code:   String(job.versionCode),
          api_base:       job.apiBase,
          callback_base:  callbackBase,
        },
      }),
    },
  );

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`GitHub dispatch failed (${res.status}): ${body}`);
  }
  return { dispatched: true };
}

module.exports = { dispatch };
