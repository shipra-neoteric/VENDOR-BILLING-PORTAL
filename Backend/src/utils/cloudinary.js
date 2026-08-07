const cloudinary = require('cloudinary').v2;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Every upload is signed server-side so the API secret never reaches the
// browser — the client gets back just enough (signature + timestamp) to
// complete a direct browser -> Cloudinary upload itself, without the file
// ever passing through this backend (there's no multer/multipart handling
// here, and this keeps it that way).
function signUpload(folder) {
  const timestamp = Math.round(Date.now() / 1000);
  const signature = cloudinary.utils.api_sign_request({ timestamp, folder }, process.env.CLOUDINARY_API_SECRET);
  return {
    signature,
    timestamp,
    folder,
    apiKey: process.env.CLOUDINARY_API_KEY,
    cloudName: process.env.CLOUDINARY_CLOUD_NAME,
  };
}

module.exports = { cloudinary, signUpload };
