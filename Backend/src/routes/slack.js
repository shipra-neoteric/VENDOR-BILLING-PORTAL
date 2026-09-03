const express = require('express');
const router = express.Router();
const { handleInteraction, handleEvent } = require('../controllers/slackController');

// No JWT auth here — Slack signs each request itself (verified inside the
// handlers using the raw body captured by index.js's parsers).
router.post('/interactions', handleInteraction); // button clicks / modal submits
router.post('/events', handleEvent);             // DMs to the bot (e.g. "pending")

module.exports = router;
