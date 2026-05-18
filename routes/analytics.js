// routes/analytics.js
const express = require('express');
const { trackEvent } = require('../utils/analyticsHelper');
const { AnalyticsSummary, AnalyticsEvent } = require('../models/CoreSchemas'); // Added AnalyticsEvent
const authMiddleware = require('../middleware/authMiddleware');

const router = express.Router();

// --- ROUTE 1: SILENT EVENT LISTENER ---
router.post('/track', authMiddleware, (req, res) => {
  const { targetUser, eventType, metadata } = req.body;
  const actor = req.user.userId;
  trackEvent({ actor, targetUser, eventType, metadata });
  res.status(200).send();
});

// --- ROUTE 2: FETCH USER ANALYTICS SUMMARY & RECENT PULSE ---
router.get('/summary', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;

    // 1. Fetch the Aggregated Summary
    let summary = await AnalyticsSummary.findOne({ user: userId });
    
    // If cron hasn't run yet, provide a baseline payload
    if (!summary) {
        summary = { weeklyProfileViews: 0, projectClicks: 0, mentorshipRequests: 0, isNew: true };
    }

    // 2. Fetch the Live Recent Pulse (Limit 4 for extreme performance)
    const recentPulse = await AnalyticsEvent.find({ targetUser: userId })
        .sort({ createdAt: -1 })
        .limit(4)
        .populate('actor', 'name role'); // Crucial: Who triggered the event?

    // 3. Return both as a bundled JSON response
    res.status(200).json({ summary, recentPulse });
  } catch (error) {
    res.status(500).json({ message: 'Server error fetching analytics.' });
  }
});

module.exports = router;