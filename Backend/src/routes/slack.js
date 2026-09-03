const express = require('express');
const router = express.Router();
const { handleInteraction } = require('../controllers/slackController');

// No JWT auth here — Slack signs the request itself (verified inside
// handleInteraction using the raw body captured by index.js's urlencoded
// parser). This is the only inbound entry point Slack calls.
router.post('/interactions', handleInteraction);

module.exports = router;
