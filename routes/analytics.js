// routes/analytics.js
const express = require('express');
const { trackEvent } = require('../utils/analyticsHelper');
const authMiddleware = require('../middleware/authMiddleware');

const router = express.Router();

// --- ROUTE 1: SILENT EVENT LISTENER ---
// URL: POST /api/analytics/track
router.post('/track', authMiddleware, (req, res) => {
  const { targetUser, eventType, metadata } = req.body;
  const actor = req.user.userId;

  // Immediately push to the tracking engine
  trackEvent({ actor, targetUser, eventType, metadata });

  // Instantly return 200 OK so the frontend doesn't hang
  res.status(200).send();
});

module.exports = router;