const http = require('http');
const https = require('https');
const { flattenReportImages, uploadReportImagesToCloudinary } = require('./dprImages');

// POSTs a flat JSON payload to the configured n8n webhook, which routes the
// notification to the right Slack channel via slackChannelId. Silently
// no-ops if the webhook isn't configured (e.g. local dev) — this is a
// notification, never something a request should fail over. Uses the
// built-in http(s) module rather than adding a dependency (no axios in this
// backend).
// Node's http(s).request never follows redirects on its own — an http:// URL
// whose host force-redirects to https:// (or any other 3xx) would otherwise
// silently "fail" with a 30x logged to the console while n8n never actually
// receives the payload. Followed manually, capped at a few hops so a
// misconfigured redirect loop can't hang the request indefinitely.
function postOnce(url, data, redirectsLeft) {
  return new Promise((resolve) => {
    let parsed;
    try {
      parsed = new URL(url);
    } catch (err) {
      console.error('n8n DPR webhook failed:', err.message);
      return resolve();
    }
    const client = parsed.protocol === 'http:' ? http : https;
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
          if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && redirectsLeft > 0) {
            const nextUrl = new URL(res.headers.location, parsed).toString();
            return resolve(postOnce(nextUrl, data, redirectsLeft - 1));
          }
          if (res.statusCode >= 300) console.error(`n8n DPR webhook failed: HTTP ${res.statusCode}`);
          resolve();
        });
      }
    );
    req.on('error', (err) => { console.error('n8n DPR webhook failed:', err.message); resolve(); });
    req.write(data);
    req.end();
  });
}

function postToN8nWebhook(payload) {
  const url = process.env.N8N_DPR_WEBHOOK;
  if (!url) return Promise.resolve();
  return postOnce(url, JSON.stringify(payload), 3);
}

// Note: n8n's webhook trigger nests whatever this posts under a top-level
// `body` key in its own output — e.g. this file's `slackWebhookUrl` field
// shows up in n8n as `{{ $json.body.slackWebhookUrl }}`, not `{{ $json.slackWebhookUrl }}`.
async function notifyDailyProgressReport(report, project) {
  const uploaded = await uploadReportImagesToCloudinary(flattenReportImages(report), report._id);
  const images = uploaded.map((img) => ({
    url: img.url, // a real Cloudinary secure_url — Slack fetches this with no auth of its own
    workType: img.workType,
    // 'images' = general work-in-progress shots, 'beforeImages'/'afterImages'
    // = the same spot before/after — matches DailyProgressReport's own schema.
    kind: img.kind,
    name: img.name,
  }));
  return postToN8nWebhook({
    reportId: String(report._id),
    projectId: String(report.projectId),
    projectName: report.projectName,
    slackChannelId: (project && project.slackChannelId) || '',
    // Per-project Slack Incoming Webhook URL — n8n can POST the formatted
    // message straight here (an HTTP Request node) instead of going through
    // Slack's channel-lookup API, which needs the bot invited to every
    // channel and returns the same "channel_not_found" whether the ID is
    // wrong or the bot just isn't a member.
    slackWebhookUrl: (project && project.slackWebhookUrl) || '',
    driName: report.driName,
    vendorCode: report.vendorCode,
    vendorName: report.vendorName,
    date: new Date(report.date).toISOString().slice(0, 10),
    shiftType: report.shiftType,
    labourCount: report.labourCount,
    // Per-work-type breakdown without the raw base64 photo data — that would
    // bloat this payload by megabytes for no reason now that `images` below
    // carries proper fetchable URLs for the same photos.
    workEntries: (report.workEntries || []).map(e => ({
      workType: e.workType,
      imageCount: (e.images || []).length,
      beforeImageCount: (e.beforeImages || []).length,
      afterImageCount: (e.afterImages || []).length,
    })),
    images,
    isPublicSubmission: report.isPublicSubmission,
  });
}

module.exports = { notifyDailyProgressReport };
