// MongoDB caps a document at 16MB total. Attachments are stored as base64
// data URLs inline on the WorkOrder doc, so a handful of large files can blow
// past that limit and turn into a cryptic BSON error at save time — catch it
// early with a clear message instead.
const MAX_FILES = 5;
const MAX_TOTAL_MB = 8;

function documentsExceedLimit(documents) {
  if (!Array.isArray(documents)) return { exceeds: false };
  if (documents.length > MAX_FILES) {
    return { exceeds: true, reason: `A work order can have at most ${MAX_FILES} attached documents` };
  }
  const totalMb = documents.reduce((s, d) => s + ((d?.url?.length || 0) * 0.75) / (1024 * 1024), 0);
  if (totalMb > MAX_TOTAL_MB) {
    return { exceeds: true, reason: `Attached documents total ${totalMb.toFixed(1)}MB, exceeding the ${MAX_TOTAL_MB}MB limit` };
  }
  return { exceeds: false };
}

module.exports = { documentsExceedLimit };
