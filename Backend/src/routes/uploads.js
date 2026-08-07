const router = require('express').Router();
const { authenticate } = require('../middleware/auth');
const { signUpload } = require('../utils/cloudinary');

// Server-controlled allowlist — the client picks which of these a given
// upload belongs to, but can't invent an arbitrary Cloudinary folder to sign
// against.
const ALLOWED_FOLDERS = ['daily-progress-reports', 'work-orders'];

// POST /api/uploads/sign — authenticated only. The public forms (which also
// upload documents/photos with no logged-in user) use the separate, fixed-
// folder signer mounted under /api/public instead — see routes/public.js.
router.post('/sign', authenticate, (req, res) => {
  const { folder } = req.body;
  if (!ALLOWED_FOLDERS.includes(folder)) {
    return res.status(400).json({ success: false, message: 'Invalid upload folder' });
  }
  res.json({ success: true, message: 'Success', data: signUpload(folder) });
});

module.exports = router;
