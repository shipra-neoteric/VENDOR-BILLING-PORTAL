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

module.exports = { flattenReportImages };
