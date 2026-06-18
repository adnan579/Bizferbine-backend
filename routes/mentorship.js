// routes/mentorship.js
const express = require('express');
const { Mentorship, User } = require('../models/CoreSchemas');
const authMiddleware = require('../middleware/authMiddleware');
const { trackEvent } = require('../utils/analyticsHelper'); // Safely imported at the top

const router = express.Router();

// --- ROUTE 1: SEND A MENTORSHIP REQUEST ---
// URL: POST /api/mentorship/request
router.post('/request', authMiddleware, async (req, res) => {
  try {
    const { mentorId, message, scheduledSession } = req.body;
    const menteeId = req.user.userId;

    // 1. Prevent users from requesting themselves
    if (menteeId === mentorId) {
      return res.status(400).json({ message: "You cannot send a mentorship request to yourself." });
    }

    // 2. ROADMAP FIX: Role Validation
    // Ensure the target user is actually registered as a Mentor or Admin
    const targetMentor = await User.findById(mentorId);
    if (!targetMentor) return res.status(404).json({ message: "Mentor not found." });
    if (targetMentor.role !== 'Mentor' && targetMentor.role !== 'Admin' && targetMentor.role !== 'SuperAdmin') {
      return res.status(400).json({ message: "This user does not have Mentor privileges." });
    }

    // 3. ROADMAP FIX: Prevent Duplicate Requests
    const existingRequest = await Mentorship.findOne({
      mentee: menteeId,
      mentor: mentorId,
      status: { $in: ['Pending', 'Accepted'] } // Blocks if already pending or currently active
    });

    if (existingRequest) {
      return res.status(400).json({ message: "You already have an active or pending request with this mentor." });
    }

    const newRequest = new Mentorship({
      mentee: menteeId,
      mentor: mentorId,
      message,
      scheduledSession
    });

    await newRequest.save();

    // --- SILENT ANALYTICS: Track the Request ---
    trackEvent({
      actor: menteeId,
      targetUser: mentorId,
      eventType: 'MENTORSHIP_REQUEST'
    });

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

    // --- SILENT ANALYTICS: Track the Acceptance ---
    if (status === 'Accepted') {
      trackEvent({
        actor: req.user.userId, // The mentor who accepted
        targetUser: request.mentee, // The mentee who got accepted
        eventType: 'MENTORSHIP_ACCEPTED'
      });
    }

    res.status(200).json({ message: `Mentorship request ${status}!`, request });
  } catch (error) {
    console.error('Update Mentorship Status Error:', error);
    res.status(500).json({ message: 'Server error updating status.' });
  }
});

// --- ROUTE 4: ALGORITHMIC MATCHMAKING (QUIZ) ---
// URL: POST /api/mentorship/match
router.post('/match', authMiddleware, async (req, res) => {
  try {
    const { goals, industry, stage, location, communication } = req.body;

    const keywords = [];
    if (industry) keywords.push(new RegExp(industry, 'i'));
    if (goals && goals.length > 0) {
      goals.forEach(goal => keywords.push(new RegExp(goal, 'i')));
    }
    if (stage) keywords.push(new RegExp(stage, 'i'));
    if (location) keywords.push(new RegExp(location, 'i'));
    if (communication) keywords.push(new RegExp(communication, 'i'));

    const query = { _id: { $ne: req.user.userId } };

    if (keywords.length > 0) {
      query.$or = [
        { industry: { $in: keywords } },
        { bio: { $in: keywords } },
        { headline: { $in: keywords } },
        { skills: { $in: keywords } },
        { location: { $in: keywords } }
      ];
    }

    const matches = await User.find(query).limit(10).select('-password');
    res.status(200).json({ matches: matches.length > 0 ? matches : await User.find({ _id: { $ne: req.user.userId } }).limit(4).select('-password') });
  } catch (error) {
    console.error('Matchmaking Error:', error);
    res.status(500).json({ message: 'Server error during algorithmic match.' });
  }
});

module.exports = router;