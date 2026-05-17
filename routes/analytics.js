// routes/analytics.js
const express = require('express');
const { trackEvent } = require('../utils/analyticsHelper');
const { AnalyticsSummary } = require('../models/CoreSchemas');
const authMiddleware = require('../middleware/authMiddleware');

const router = express.Router();

// --- ROUTE 1: SILENT EVENT LISTENER (From Phase 1.5) ---
router.post('/track', authMiddleware, (req, res) => {
  const { targetUser, eventType, metadata } = req.body;
  const actor = req.user.userId;
  trackEvent({ actor, targetUser, eventType, metadata });
  res.status(200).send();
});

// --- ROUTE 2: FETCH USER ANALYTICS SUMMARY (Phase 2) ---
router.get('/summary', authMiddleware, async (req, res) => {
  try {
    const summary = await AnalyticsSummary.findOne({ user: req.user.userId });
    
    // If cron hasn't run yet or user is brand new, send a 0-state payload
    if (!summary) {
        return res.status(200).json({
            weeklyProfileViews: 0, projectClicks: 0, mentorshipRequests: 0, isNew: true
        });
    }

    res.status(200).json(summary);
  } catch (error) {
    res.status(500).json({ message: 'Server error fetching analytics.' });
  }
});

module.exports = router;