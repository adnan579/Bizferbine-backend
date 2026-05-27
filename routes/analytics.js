// routes/analytics.js
const express = require('express');
const { trackEvent } = require('../utils/analyticsHelper');
const { AnalyticsSummary, AnalyticsEvent, UserMomentum, EconomicIndex, Event } = require('../models/CoreSchemas'); // Added AnalyticsEvent
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

// 1. Fetch User Momentum Score (Phase 5)
router.get('/momentum/:userId', authMiddleware, async (req, res) => {
  try {
    let momentum = await UserMomentum.findOne({ user: req.params.userId });
    if (!momentum) {
      momentum = { responsiveness: 50, followThrough: 50, execution: 0, participation: 0, trend: 'Stable' };
    }
    // Calculate aggregate
    const aggregate = (momentum.responsiveness + momentum.followThrough + momentum.execution + momentum.participation) / 4;
    res.status(200).json({ aggregateScore: aggregate, data: momentum });
  } catch (error) {
    res.status(500).json({ message: 'Error fetching momentum.' });
  }
});

// 2. Event ROI / Success Feed (Stop tracking attendance, track execution)
router.get('/event-roi/:eventId', authMiddleware, async (req, res) => {
  try {
    const economicLogs = await EconomicIndex.find({ eventSource: req.params.eventId });

    const roiSummary = economicLogs.reduce((acc, log) => {
      if (!acc[log.metricType]) acc[log.metricType] = 0;
      acc[log.metricType] += log.value;
      return acc;
    }, {});

    res.status(200).json({
      message: "Event ROI calculated based on Execution Metrics.",
      successFeed: roiSummary
    });
  } catch (error) {
    res.status(500).json({ message: 'Error calculating Event ROI.' });
  }
});

module.exports = router;