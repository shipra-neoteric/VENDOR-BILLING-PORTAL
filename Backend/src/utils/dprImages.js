// A Daily Progress Report's photos live nested under workEntries[].images/
// beforeImages/afterImages, each a { name, url } pair where `url` is a
// base64 data URL (see models/DailyProgressReport.js). Both the n8n webhook
// payload (which needs a stable flat index per photo to build a public URL)
// and the image-serving route (which needs to resolve that same index back
// to a photo) must walk this structure in the exact same order — this is
// that one shared order, so the two can never drift apart.
function flattenReportImages(report) {
  const flat = [];
  (report.workEntries || []).forEach((entry) => {
    ['images', 'beforeImages', 'afterImages'].forEach((kind) => {
      (entry[kind] || []).forEach((img) => {
        if (img && img.url) flat.push({ workType: entry.workType, kind, name: img.name || '', url: img.url });
      });
    });
  });
  return flat;
}

// Uploads a report's photos (each still a base64 data URL at this point) to
// Cloudinary, so the n8n/Slack notification gets a real, permanent, publicly-
// fetchable URL — the same account already used for every other upload in
// this app (see utils/cloudinary.js), instead of a link back to our own
// backend. One photo failing to upload never blocks the rest — it's just
// dropped from the notification, same as this being fire-and-forget overall.
async function uploadReportImagesToCloudinary(flatImages, reportId) {
  const { cloudinary } = require('./cloudinary');
  const uploaded = await Promise.all(
    flatImages.map(async (img, i) => {
      try {
        const res = await cloudinary.uploader.upload(img.url, {
          folder: `daily-progress-reports/${reportId}`,
          public_id: String(i),
          overwrite: true,
        });
        return { ...img, url: res.secure_url };
      } catch (err) {
        console.error(`Cloudinary upload failed for report ${reportId} image ${i}:`, err.message);
        return null;
      }
    })
  );
  return uploaded.filter(Boolean);
}

module.exports = { flattenReportImages, uploadReportImagesToCloudinary };
