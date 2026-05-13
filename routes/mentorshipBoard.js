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
    
    // Fetch the user to automatically grab their industry
    const mentee = await User.findById(req.user.userId);

    const newApplication = new MentorshipApplication({
      mentee: mentee._id,
      title,
      description,
      industry: mentee.industry || 'General' // Failsafe in case industry is blank
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

    // 1. DEBUGGING: Let's see exactly what the mentor's industry is!
    console.log(`\n=== RUNNING ALGORITHM FOR MENTOR INDUSTRY: "${mentor.industry}" ===`);

    // 2. KEYWORD LOGIC: Split the industry into words (e.g., "Information Technology" -> ["Information", "Technology"])
    // This removes extra spaces and makes the search highly flexible.
    const keywords = mentor.industry.trim().split(/\s+/).map(word => new RegExp(word, 'i'));

    // 3. Find matching applications
    const matches = await MentorshipApplication.find({
      status: 'Open',
      industry: { $in: keywords }, // $in searches for ANY of the keywords!
      mentee: { $ne: mentor._id } 
    }).populate('mentee', 'name role industry');

    // 4. DEBUGGING: Let's pull ALL open apps just to see what exists in the database
    const allOpenApps = await MentorshipApplication.find({ status: 'Open' });
    console.log("All Open Applications Currently in DB:", allOpenApps.map(app => ({
        menteeId: app.mentee,
        industrySavedAs: app.industry
    })));
    console.log("==============================================================\n");

    res.status(200).json({ 
      message: `Found ${matches.length} applications matching your expertise in ${mentor.industry}.`, 
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

    // Ensure the mentor hasn't already sent an offer
    const alreadyOffered = application.offers.some(offer => offer.mentorId.toString() === mentorId);
    if (alreadyOffered) return res.status(400).json({ message: 'You have already sent an offer for this application.' });

    // Push the offer into the array
    application.offers.push({
      mentorId: mentorId,
      message: message
    });

    await application.save();
    // --- NEW: TRIGGER MENTORSHIP NOTIFICATION ---
    await sendNotification({
        recipient: application.mentee, // The person who wrote the application
        sender: mentorId,              // The mentor sending the offer
        type: 'MentorshipOffer',
        message: `You have received a new mentorship offer for your application: "${application.title}"`,
        targetId: application._id
    });
    // --------------------------------------------
    res.status(201).json({ message: 'Offer sent successfully to the Mentee!', application });
  } catch (error) {
    console.error('Offer Error:', error);
    res.status(500).json({ message: 'Server error sending offer.' });
  }
});

module.exports = router;