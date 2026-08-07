const http = require('http');
const https = require('https');

// POSTs a flat JSON payload to the configured n8n webhook, which routes the
// notification to the right Slack channel via slackChannelId. Silently
// no-ops if the webhook isn't configured (e.g. local dev) — this is a
// notification, never something a request should fail over. Uses the
// built-in http(s) module rather than adding a dependency (no axios in this
// backend).
function postToN8nWebhook(payload) {
  const url = process.env.N8N_DPR_WEBHOOK;
  if (!url) return Promise.resolve();
  return new Promise((resolve) => {
    try {
      const parsed = new URL(url);
      const client = parsed.protocol === 'http:' ? http : https;
      const data = JSON.stringify(payload);
      const req = client.request(
        {
          hostname: parsed.hostname,
          port: parsed.port || undefined,
          path: parsed.pathname + (parsed.search || ''),
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
        },
        (res) => {
          res.on('data', () => {});
          res.on('end', () => {
            if (res.statusCode >= 300) console.error(`n8n DPR webhook failed: HTTP ${res.statusCode}`);
            resolve();
          });
        }
      );
      req.on('error', (err) => { console.error('n8n DPR webhook failed:', err.message); resolve(); });
      req.write(data);
      req.end();
    } catch (err) {
      console.error('n8n DPR webhook failed:', err.message);
      resolve();
    }
  });
}

// Flat payload — no `{ body: {...} }` wrapper — so n8n's Slack node can
// reference fields directly as {{ $json.slackChannelId }} etc. with no
// transformation step.
function notifyDailyProgressReport(report, project) {
  return postToN8nWebhook({
    reportId: String(report._id),
    projectId: String(report.projectId),
    projectName: report.projectName,
    slackChannelId: (project && project.slackChannelId) || '',
    driName: report.driName,
    vendorCode: report.vendorCode,
    vendorName: report.vendorName,
    date: new Date(report.date).toISOString().slice(0, 10),
    shiftType: report.shiftType,
    labourCount: report.labourCount,
    workEntries: report.workEntries,
    isPublicSubmission: report.isPublicSubmission,
  });
}

module.exports = { notifyDailyProgressReport };
