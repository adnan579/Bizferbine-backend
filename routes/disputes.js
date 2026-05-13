// routes/disputes.js
const express = require('express');
const { Dispute } = require('../models/CoreSchemas');
const authMiddleware = require('../middleware/authMiddleware');

const router = express.Router();

// --- ROUTE 1: SUBMIT A NEW DISPUTE ---
// URL: POST /api/disputes
router.post('/', authMiddleware, async (req, res) => {
  try {
    const { reportedEntityId, module, reason, evidence } = req.body;
    
    const newDispute = new Dispute({
      reporter: req.user.userId,
      reportedEntityId,
      module,
      reason,
      evidence
    });

    await newDispute.save();
    
    res.status(201).json({ message: 'Dispute submitted to Overseer Admin successfully.', dispute: newDispute });
  } catch (error) {
    console.error('Dispute Submission Error:', error);
    res.status(500).json({ message: 'Server error submitting dispute.' });
  }
});

module.exports = router;