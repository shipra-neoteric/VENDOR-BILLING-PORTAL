// Documents are now Cloudinary URLs (see Backend/src/utils/cloudinary.js),
// not base64 inline on the WorkOrder doc — only the file-count cap still
// applies; there's no combined-payload size to police any more.
const MAX_FILES = 5;

function documentsExceedLimit(documents) {
  if (!Array.isArray(documents)) return { exceeds: false };
  if (documents.length > MAX_FILES) {
    return { exceeds: true, reason: `A work order can have at most ${MAX_FILES} attached documents` };
  }
  return { exceeds: false };
}

module.exports = { documentsExceedLimit };
