// routes/profile.js
const express = require('express');
const { sendNotification } = require('../utils/notificationHelper');
const multer = require('multer');
const { User, Insight } = require('../models/CoreSchemas');
const authMiddleware = require('../middleware/authMiddleware');

const router = express.Router();

// --- SECURE MULTER CONFIGURATION (PHASE 1 ROADMAP FIX) ---
const storage = multer.diskStorage({
  destination: function (req, file, cb) { cb(null, 'uploads/'); },
  filename: function (req, file, cb) { cb(null, Date.now() + '-' + file.originalname); }
});

// Added File Type Validation and 5MB Size Limit to prevent server crashing/malware
const upload = multer({ 
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB Limit
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Only image files are permitted!'), false);
  }
});

// --- ROUTE 1: UPDATE IDENTITY & BRANDING ---
router.put('/', authMiddleware, upload.fields([
    { name: 'profilePicture', maxCount: 1 }, 
    { name: 'profileBanner', maxCount: 1 }
]), async (req, res) => {
  try {
    const { name, username, headline, industry, bio, location, linkedIn, github, website, skills } = req.body; // Added industry
    
    const user = await User.findById(req.user.userId);
    if (!user) return res.status(404).json({ message: 'User not found.' });

    if (name) user.name = name;
    if (headline) user.headline = headline;
    if (industry) user.industry = industry; // Added this!
    if (bio) user.bio = bio;
    if (location) user.location = location;

    if (username && username !== user.username) {
        const formattedUsername = username.toLowerCase().replace(/\s+/g, '');
        const existingUser = await User.findOne({ username: formattedUsername });
        if (existingUser) return res.status(400).json({ message: `The username @${formattedUsername} is already taken.` });
        user.username = formattedUsername;
    }
    
    if (skills) user.skills = skills.split(',').map(skill => skill.trim());

    if (!user.socialLinks) user.socialLinks = {};
    if (linkedIn !== undefined) user.socialLinks.linkedIn = linkedIn;
    if (github !== undefined) user.socialLinks.github = github;
    if (website !== undefined) user.socialLinks.website = website;

    if (req.files) {
        if (req.files['profilePicture']) user.profilePictureUrl = req.files['profilePicture'][0].path;
        if (req.files['profileBanner']) user.profileBannerUrl = req.files['profileBanner'][0].path;
    }

    await user.save();
    user.passwordHash = undefined; 
    res.status(200).json({ message: 'Identity updated!', profile: user });
  } catch (error) {
    res.status(500).json({ message: 'Server error updating profile. ' + error.message });
  }
});

// --- ROUTE 2: ADD A CASE STUDY (PORTFOLIO) ---
router.post('/portfolio', authMiddleware, upload.single('projectImage'), async (req, res) => {
  try {
    // NEW: Added stack and metrics
    const { title, challenge, solution, result, projectUrl, githubUrl, stack } = req.body;
    
    if (!title || !solution) {
        return res.status(400).json({ message: 'Portfolio case studies require at least a title and solution.' });
    }

    const user = await User.findById(req.user.userId);
    let imagePath = null;
    if (req.file) imagePath = req.file.path;

    user.portfolio.push({
      title, challenge, solution, result, projectUrl, githubUrl, imageUrl: imagePath,
      // Temporarily piggybacking stack on 'challenge' if schema isn't updated yet, 
      // but assuming we add it to the string or schema later. For now, format it:
      challenge: stack ? `Stack: ${stack} | ${challenge}` : challenge
    });

    await user.save();
    res.status(201).json({ message: 'Case Study deployed!', portfolio: user.portfolio });
  } catch (error) {
    res.status(500).json({ message: 'Server error adding case study.' });
  }
});

// --- ROUTE 3: LEAVE A TESTIMONIAL ---
router.post('/:userId/testimonial', authMiddleware, async (req, res) => {
    try {
      const targetUserId = req.params.userId;
      const senderId = req.user.userId;
      const { text } = req.body;
  
      if (targetUserId === senderId) return res.status(400).json({ message: 'You cannot review yourself.' });
  
      const user = await User.findById(targetUserId);
      if (!user) return res.status(404).json({ message: 'User not found.' });
  
      user.testimonials.push({ author: senderId, text: text });
      await user.save();
      
      await sendNotification({
        recipient: targetUserId, sender: senderId, type: 'Testimonial',
        message: `Someone just left a new professional endorsement on your profile!`, targetId: user._id
      });
      res.status(201).json({ message: 'Endorsement added!', testimonials: user.testimonials });
    } catch (error) {
      res.status(500).json({ message: 'Server error adding endorsement.' });
    }
});

// --- ROUTE 4: VIEW ADVANCED PROFILE & CALCULATE REPUTATION (PHASE 2 ROADMAP) ---
router.get('/:userId', authMiddleware, async (req, res) => {
  try {
    const targetUserId = req.params.userId;

    const userProfile = await User.findById(targetUserId)
        .select('-passwordHash')
        .populate('testimonials.author barterReviews.reviewer', 'name role profilePictureUrl username');

    if (!userProfile) return res.status(404).json({ message: 'Profile not found.' });

    // PHASE 1 FIX: Added Pagination/Limits to prevent database throttling
    const recentInsights = await Insight.find({ author: targetUserId }).sort({ createdAt: -1 }).limit(10);

    // --- NEW: THE REPUTATION ENGINE ALGORITHM ---
    let repScore = 50; // Baseline score
    let autoBadges = [];

    // 1. Barter Review Impact (+ or -)
    if (userProfile.barterReviews && userProfile.barterReviews.length > 0) {
      const avgRating = userProfile.barterReviews.reduce((acc, curr) => acc + curr.rating, 0) / userProfile.barterReviews.length;
      repScore += (avgRating - 3) * 10; // 5 star adds 20 pts, 1 star subtracts 20 pts
      if (avgRating >= 4.5 && userProfile.barterReviews.length >= 3) autoBadges.push("Top Collaborator");
    }

    // 2. Endorsement Impact (+2 per testimonial)
    if (userProfile.testimonials) {
      repScore += userProfile.testimonials.length * 2;
      if (userProfile.testimonials.length >= 5) autoBadges.push("Highly Endorsed");
    }

    // 3. Network Gravity (+1 per 10 followers, max +15)
    if (userProfile.followers) {
      repScore += Math.min(Math.floor(userProfile.followers.length / 10), 15);
    }

    // 4. Execution Proof (Portfolio)
    if (userProfile.portfolio && userProfile.portfolio.length >= 2) {
      repScore += 5;
      autoBadges.push("Verified Builder");
    }

    // Cap score at 99 for realism
    repScore = Math.min(Math.max(Math.floor(repScore), 10), 99);

    res.status(200).json({ 
        profile: userProfile,
        thoughtLeadershipFeed: recentInsights,
        reputation: {
          score: repScore,
          badges: [...new Set([...(userProfile.trustBadges || []), ...autoBadges])] // Merge manual & auto badges
        },
        networkPulse: {
            followersCount: userProfile.followers?.length || 0,
            followingCount: userProfile.following?.length || 0
        }
    });
  } catch (error) {
    console.error('Fetch Profile Error:', error);
    res.status(500).json({ message: 'Server error fetching profile.' });
  }
});

const { trackEvent } = require('../utils/analyticsHelper');

// ... Inside your GET /:userId route ...
router.get('/:userId', authMiddleware, async (req, res) => {
  // ... your existing code ...

  // TRIGGER SILENT ANALYTICS: Track the profile view!
  trackEvent({
    actor: req.user.userId,
    targetUser: targetUserId,
    eventType: 'PROFILE_VIEW'
  });

  res.status(200).json({ /* your existing response */ });
});

// ... Inside your POST /:userId/review route ...
trackEvent({
    actor: req.user.userId,
    targetUser: targetUserId,
    eventType: 'REVIEW_RECEIVED'
});

module.exports = router;