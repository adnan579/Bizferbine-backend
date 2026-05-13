// routes/wellness.js
const express = require('express');
const { WellnessLog } = require('../models/CoreSchemas');
const authMiddleware = require('../middleware/authMiddleware');
const router = express.Router();

// --- ROUTE 1: LOG MOOD & JOURNAL ---
router.post('/log', authMiddleware, async (req, res) => {
  try {
    const { mood, note, triggers } = req.body;
    
    const newLog = new WellnessLog({
      user: req.user.userId,
      mood,
      note,
      triggers: triggers || []
    });

    await newLog.save();
    res.status(201).json({ message: 'Wellness log securely saved.', log: newLog });
  } catch (error) {
    console.error('Wellness Log Error:', error);
    res.status(500).json({ message: 'Server error saving wellness data.' });
  }
});

// --- ROUTE 2: GET USER'S RECENT LOGS ---
router.get('/logs', authMiddleware, async (req, res) => {
  try {
    const logs = await WellnessLog.find({ user: req.user.userId })
      .sort({ createdAt: -1 })
      .limit(14); // Get last 14 entries for trend mapping
    
    res.status(200).json(logs);
  } catch (error) {
    res.status(500).json({ message: 'Server error fetching wellness logs.' });
  }
});

module.exports = router;