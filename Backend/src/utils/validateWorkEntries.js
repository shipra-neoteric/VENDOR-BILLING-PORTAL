// Images are Cloudinary URLs (see Backend/src/utils/cloudinary.js), not
// base64 inline on the report doc, so there's no combined-payload size to
// police — only per-category counts. Each category needs at least MIN_IMAGES
// and no more than MAX_IMAGES, matching the client's own cap. Before/After
// are a distinct pair (one snapshot of the same spot before work started and
// after it finished) — same min/max, but never satisfied by `images`.
const MIN_IMAGES_PER_CATEGORY = 1;
const MAX_IMAGES_PER_CATEGORY = 5;
// Optional for now — Work Photos above are the only mandatory evidence.
const MIN_BEFORE_AFTER_IMAGES = 0;
const MAX_BEFORE_AFTER_IMAGES = 5;

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
    const beforeCount = Array.isArray(entry.beforeImages) ? entry.beforeImages.length : 0;
    if (beforeCount < MIN_BEFORE_AFTER_IMAGES) {
      return `"${entry.workType}" needs a before photo`;
    }
    if (beforeCount > MAX_BEFORE_AFTER_IMAGES) {
      return `"${entry.workType}" has ${beforeCount} before photos, exceeding the ${MAX_BEFORE_AFTER_IMAGES}-photo limit`;
    }
    const afterCount = Array.isArray(entry.afterImages) ? entry.afterImages.length : 0;
    if (afterCount < MIN_BEFORE_AFTER_IMAGES) {
      return `"${entry.workType}" needs an after photo`;
    }
    if (afterCount > MAX_BEFORE_AFTER_IMAGES) {
      return `"${entry.workType}" has ${afterCount} after photos, exceeding the ${MAX_BEFORE_AFTER_IMAGES}-photo limit`;
    }
  }
  return null;
}

module.exports = {
  workEntriesInvalidReason,
  MIN_IMAGES_PER_CATEGORY, MAX_IMAGES_PER_CATEGORY,
  MIN_BEFORE_AFTER_IMAGES, MAX_BEFORE_AFTER_IMAGES,
};
