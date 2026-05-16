// routes/mentorshipBoard.js
const express = require('express');
const { sendNotification } = require('../utils/notificationHelper');
const { MentorshipApplication, User } = require('../models/CoreSchemas');
const authMiddleware = require('../middleware/authMiddleware');

const router = express.Router();

// --- ROUTE 1: MENTEE CREATES AN APPLICATION ---
// URL: POST /api/mentorship-board/apply
router.post('/apply', authMiddleware, async (req, res) => {
  try {
    const { title, description } = req.body;
    
    const mentee = await User.findById(req.user.userId);

    // ROADMAP FIX: Prevent Duplicate Open Applications
    // We don't want mentees spamming the board with 10 open applications at once
    const existingOpenApp = await MentorshipApplication.findOne({
      mentee: mentee._id,
      status: 'Open'
    });

    if (existingOpenApp) {
      return res.status(400).json({ message: "You already have an open broadcast on the network. Please wait for matches or close it before posting a new one." });
    }

    const newApplication = new MentorshipApplication({
      mentee: mentee._id,
      title,
      description,
      industry: mentee.industry || 'General' 
    });

    await newApplication.save();
    res.status(201).json({ message: 'Mentorship application published successfully!', application: newApplication });
  } catch (error) {
    console.error('Application Error:', error);
    res.status(500).json({ message: 'Server error creating application.' });
  }
});

// --- ROUTE 2: THE SMART KEYWORD MATCHING ALGORITHM ---
// URL: GET /api/mentorship-board/matches
router.get('/matches', authMiddleware, async (req, res) => {
  try {
    const mentor = await User.findById(req.user.userId);
    
    if (!mentor.industry) {
        return res.status(400).json({ message: "Please update your profile with an industry to see matches." });
    }

    console.log(`\n=== RUNNING ALGORITHM FOR MENTOR INDUSTRY: "${mentor.industry}" ===`);

    const keywords = mentor.industry.trim().split(/\s+/).map(word => new RegExp(word, 'i'));

    // Added `.limit(20)` for the pagination roadmap item to prevent overloading the frontend
    const matches = await MentorshipApplication.find({
      status: 'Open',
      industry: { $in: keywords }, 
      mentee: { $ne: mentor._id } 
    }).populate('mentee', 'name role industry').limit(20);

    res.status(200).json({ 
      message: `Found ${matches.length} applications matching your expertise.`, 
      matches 
    });
  } catch (error) {
    console.error('Matching Error:', error);
    res.status(500).json({ message: 'Server error running matching algorithm.' });
  }
});

// --- ROUTE 3: MENTOR SENDS AN OFFER ---
// URL: POST /api/mentorship-board/:applicationId/offer
router.post('/:applicationId/offer', authMiddleware, async (req, res) => {
  try {
    const { message } = req.body;
    const applicationId = req.params.applicationId;
    const mentorId = req.user.userId;

    const application = await MentorshipApplication.findById(applicationId);
    
    if (!application) return res.status(404).json({ message: 'Application not found.' });
    if (application.status !== 'Open') return res.status(400).json({ message: 'This application is no longer open.' });

    // ROADMAP FIX: Ensure the user sending the offer is actually a Mentor
    const mentorUser = await User.findById(mentorId);
    if (mentorUser.role !== 'Mentor' && mentorUser.role !== 'Admin' && mentorUser.role !== 'SuperAdmin') {
      return res.status(403).json({ message: 'Only verified Mentors can dispatch offers on the board.' });
    }

    const alreadyOffered = application.offers.some(offer => offer.mentorId.toString() === mentorId);
    if (alreadyOffered) return res.status(400).json({ message: 'You have already sent an offer for this application.' });

    application.offers.push({
      mentorId: mentorId,
      message: message
    });

    await application.save();

    await sendNotification({
        recipient: application.mentee, 
        sender: mentorId,              
        type: 'MentorshipOffer',
        message: `You have received a new mentorship offer for your application: "${application.title}"`,
        targetId: application._id
    });

    res.status(201).json({ message: 'Offer sent successfully to the Mentee!', application });
  } catch (error) {
    console.error('Offer Error:', error);
    res.status(500).json({ message: 'Server error sending offer.' });
  }
});

module.exports = router;