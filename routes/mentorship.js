// routes/mentorship.js
const express = require('express');
const { Mentorship, User } = require('../models/CoreSchemas');
const authMiddleware = require('../middleware/authMiddleware');

const router = express.Router();

// --- ROUTE 1: SEND A MENTORSHIP REQUEST ---
// URL: POST /api/mentorship/request
router.post('/request', authMiddleware, async (req, res) => {
  try {
    const { mentorId, message, scheduledSession } = req.body;
    const menteeId = req.user.userId;

    // Prevent users from requesting themselves
    if (menteeId === mentorId) {
      return res.status(400).json({ message: "You cannot send a mentorship request to yourself." });
    }

    const newRequest = new Mentorship({
      mentee: menteeId,
      mentor: mentorId,
      message,
      scheduledSession
    });

    await newRequest.save();

    res.status(201).json({ message: 'Mentorship request sent successfully!', request: newRequest });
  } catch (error) {
    console.error('Mentorship Request Error:', error);
    res.status(500).json({ message: 'Server error sending request.' });
  }
});

// --- ROUTE 2: VIEW MY MENTORSHIP REQUESTS ---
// URL: GET /api/mentorship
router.get('/', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;

    // Find all requests where the logged-in user is EITHER the mentee or the mentor
    const requests = await Mentorship.find({
      $or: [{ mentee: userId }, { mentor: userId }]
    }).sort({ createdAt: -1 });

    res.status(200).json(requests);
  } catch (error) {
    console.error('Fetch Mentorships Error:', error);
    res.status(500).json({ message: 'Server error fetching mentorship requests.' });
  }
});

// --- ROUTE 3: UPDATE REQUEST STATUS (Accept/Decline) ---
// URL: PUT /api/mentorship/:requestId/status
router.put('/:requestId/status', authMiddleware, async (req, res) => {
  try {
    const { status } = req.body; // Expecting 'Accepted', 'Declined', or 'Completed'
    const requestId = req.params.requestId;

    const request = await Mentorship.findById(requestId);
    if (!request) return res.status(404).json({ message: 'Request not found.' });

    // Security: Only the Mentor can accept or decline!
    if (request.mentor.toString() !== req.user.userId) {
      return res.status(403).json({ message: 'Access denied. Only the requested mentor can change this status.' });
    }

    request.status = status;
    await request.save();

    res.status(200).json({ message: `Mentorship request ${status}!`, request });
  } catch (error) {
    console.error('Update Mentorship Status Error:', error);
    res.status(500).json({ message: 'Server error updating status.' });
  }
});

module.exports = router;