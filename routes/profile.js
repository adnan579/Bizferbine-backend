// routes/profile.js
const express = require('express');
const { sendNotification } = require('../utils/notificationHelper');
const multer = require('multer');
const { User, Insight } = require('../models/CoreSchemas');
const authMiddleware = require('../middleware/authMiddleware');

const router = express.Router();

// --- MULTER CONFIGURATION ---
const storage = multer.diskStorage({
  destination: function (req, file, cb) { cb(null, 'uploads/'); },
  filename: function (req, file, cb) { cb(null, Date.now() + '-' + file.originalname); }
});
const upload = multer({ storage: storage });

// --- ROUTE 1: UPDATE IDENTITY & BRANDING ---
router.put('/', authMiddleware, upload.fields([
    { name: 'profilePicture', maxCount: 1 }, 
    { name: 'profileBanner', maxCount: 1 }
]), async (req, res) => {
  try {
    // WE ADDED name AND username HERE!
    const { name, username, headline, bio, location, linkedIn, github, website, skills } = req.body;
    
    const user = await User.findById(req.user.userId);
    if (!user) return res.status(404).json({ message: 'User not found.' });

    // Update basic text fields
    if (name) user.name = name;
    if (headline) user.headline = headline;
    if (bio) user.bio = bio;
    if (location) user.location = location;

    // USERNAME LOGIC: Check if it's taken before saving!
    if (username && username !== user.username) {
        // Format it: lowercase and remove spaces
        const formattedUsername = username.toLowerCase().replace(/\s+/g, '');
        const existingUser = await User.findOne({ username: formattedUsername });
        if (existingUser) {
            return res.status(400).json({ message: `The username @${formattedUsername} is already taken.` });
        }
        user.username = formattedUsername;
    }
    
    // Parse skills
    if (skills) {
        user.skills = skills.split(',').map(skill => skill.trim());
    }

    // Update Social Links
    if (!user.socialLinks) user.socialLinks = {};
    if (linkedIn !== undefined) user.socialLinks.linkedIn = linkedIn;
    if (github !== undefined) user.socialLinks.github = github;
    if (website !== undefined) user.socialLinks.website = website;

    // Check for uploaded files securely
    if (req.files) {
        if (req.files['profilePicture']) user.profilePictureUrl = req.files['profilePicture'][0].path;
        if (req.files['profileBanner']) user.profileBannerUrl = req.files['profileBanner'][0].path;
    }

    await user.save();
    user.passwordHash = undefined; 
    res.status(200).json({ message: 'Identity & Branding updated!', profile: user });
  } catch (error) {
    console.error('Profile Update Error:', error);
    res.status(500).json({ message: 'Server error updating profile.' });
  }
});

// --- ROUTE 2: ADD A CASE STUDY (PORTFOLIO) ---
router.post('/portfolio', authMiddleware, upload.single('projectImage'), async (req, res) => {
  try {
    const { title, challenge, solution, result, projectUrl, githubUrl } = req.body;
    
    if (!title || !solution) {
        return res.status(400).json({ message: 'Portfolio case studies require at least a title and solution.' });
    }

    const user = await User.findById(req.user.userId);
    
    let imagePath = null;
    if (req.file) imagePath = req.file.path;

    user.portfolio.push({
      title, challenge, solution, result, projectUrl, githubUrl, imageUrl: imagePath
    });

    await user.save();
    res.status(201).json({ message: 'Case Study added!', portfolio: user.portfolio });
  } catch (error) {
    console.error('Portfolio Error:', error);
    res.status(500).json({ message: 'Server error adding case study.' });
  }
});

// --- ROUTE 3: LEAVE A TESTIMONIAL ---
// URL: POST /api/profile/:userId/testimonial
router.post('/:userId/testimonial', authMiddleware, async (req, res) => {
    try {
      const targetUserId = req.params.userId;
      const senderId = req.user.userId;
      const { text } = req.body;
  
      if (targetUserId === senderId) return res.status(400).json({ message: 'You cannot review yourself.' });
  
      const user = await User.findById(targetUserId);
      if (!user) return res.status(404).json({ message: 'User not found.' });
  
      user.testimonials.push({
        author: senderId,
        text: text
      });
  
      await user.save();
      
      // --- NEW: TRIGGER TESTIMONIAL NOTIFICATION ---
      await sendNotification({
        recipient: targetUserId, // The user receiving the testimonial
        sender: senderId,        // The person writing it
        type: 'Testimonial',
        message: `Someone just left a new professional testimonial on your profile!`,
        targetId: user._id
      });
      // ---------------------------------------------
      res.status(201).json({ message: 'Testimonial added!', testimonials: user.testimonials });
    } catch (error) {
      console.error('Testimonial Error:', error);
      res.status(500).json({ message: 'Server error adding testimonial.' });
    }
  });

  // --- ROUTE: LEAVE A TRADE REVIEW ---
// URL: POST /api/profile/:userId/review
router.post('/:userId/review', authMiddleware, async (req, res) => {
  try {
    const { workspaceId, rating, text } = req.body;
    const targetUserId = req.params.userId;
    const senderId = req.user.userId;

    if (targetUserId === senderId) return res.status(400).json({ message: 'You cannot review yourself.' });

    const user = await User.findById(targetUserId);
    if (!user) return res.status(404).json({ message: 'User not found.' });

    // Prevent duplicate reviews for the exact same workspace
    const alreadyReviewed = user.barterReviews?.some(r => r.workspace.toString() === workspaceId && r.reviewer.toString() === senderId);
    if (alreadyReviewed) return res.status(400).json({ message: 'You have already reviewed this user for this specific trade.' });

    user.barterReviews.push({
      reviewer: senderId,
      workspace: workspaceId,
      rating: Number(rating),
      text
    });

    await user.save();

    await sendNotification({
      recipient: targetUserId,
      sender: senderId,
      type: 'NewReview',
      message: `You received a ${rating}-star review for a completed trade!`,
      targetId: user._id
    });

    res.status(201).json({ message: 'Review submitted!', reviews: user.barterReviews });
  } catch (error) {
    console.error('Review Error:', error);
    res.status(500).json({ message: 'Server error submitting review.' });
  }
});

// --- ROUTE 4: VIEW ADVANCED PROFILE (The Showcase) ---
router.get('/:userId', authMiddleware, async (req, res) => {
  try {
    const targetUserId = req.params.userId;

   // Fetch the user data and populate BOTH testimonials and barterReviews
    const userProfile = await User.findById(targetUserId)
        .select('-passwordHash')
        .populate('testimonials.author barterReviews.reviewer', 'name role profilePictureUrl username');

    if (!userProfile) return res.status(404).json({ message: 'Profile not found.' });

    // Fetch Thought Leadership Feed (Micro-Blogs)
    const recentInsights = await Insight.find({ author: targetUserId }).sort({ createdAt: -1 });

    res.status(200).json({ 
        profile: userProfile,
        thoughtLeadershipFeed: recentInsights,
        networkPulse: {
            followersCount: userProfile.followers.length,
            followingCount: userProfile.following.length
        }
    });
  } catch (error) {
    console.error('Fetch Profile Error:', error);
    res.status(500).json({ message: 'Server error fetching profile.' });
  }
});

module.exports = router;