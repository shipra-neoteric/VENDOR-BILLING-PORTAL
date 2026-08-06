// Same rationale as validateDocuments.js — images are stored as base64 data
// URLs inline on the report doc, so with many checked categories the combined
// payload can blow past MongoDB's 16MB document cap fast. Each category needs
// at least MIN_IMAGES (client resizes/compresses before upload — see
// WorkCategoryChecklist.tsx — so real-world images land well under this budget)
// and no more than MAX_IMAGES, matching the client's own cap.
const MIN_IMAGES_PER_CATEGORY = 1;
const MAX_IMAGES_PER_CATEGORY = 5;
const MAX_TOTAL_MB = 14;

function workEntriesInvalidReason(workEntries) {
  if (!Array.isArray(workEntries) || workEntries.length === 0) {
    return 'Select at least one work type from the checklist';
  }
  for (const entry of workEntries) {
    const count = Array.isArray(entry.images) ? entry.images.length : 0;
    if (count < MIN_IMAGES_PER_CATEGORY) {
      return `"${entry.workType}" needs at least ${MIN_IMAGES_PER_CATEGORY} photo${MIN_IMAGES_PER_CATEGORY === 1 ? '' : 's'} (has ${count})`;
    }
    if (count > MAX_IMAGES_PER_CATEGORY) {
      return `"${entry.workType}" has ${count} photos, exceeding the ${MAX_IMAGES_PER_CATEGORY}-photo limit per category`;
    }
  }
  const totalMb = workEntries
    .flatMap((e) => e.images || [])
    .reduce((s, img) => s + ((img?.url?.length || 0) * 0.75) / (1024 * 1024), 0);
  if (totalMb > MAX_TOTAL_MB) {
    return `Attached photos total ${totalMb.toFixed(1)}MB, exceeding the ${MAX_TOTAL_MB}MB limit — remove a few categories or photos`;
  }
  return null;
}

module.exports = { workEntriesInvalidReason, MIN_IMAGES_PER_CATEGORY, MAX_IMAGES_PER_CATEGORY, MAX_TOTAL_MB };
