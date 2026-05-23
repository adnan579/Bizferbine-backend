// routes/profile.js
const express = require('express');
const { sendNotification } = require('../utils/notificationHelper');
const { trackEvent } = require('../utils/analyticsHelper');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const { User, Insight, Event, BarterWorkspace, MentorshipSession } = require('../models/CoreSchemas');
const authMiddleware = require('../middleware/authMiddleware');

const router = express.Router();

// --- NEW: CLOUDINARY CDN CONFIGURATION ---
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'bizferbine_profiles', // Creates a clean folder in your Cloudinary account
    allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
    transformation: [{ width: 1000, crop: 'limit' }] // Auto-optimizes massive images!
  }
});

// Added back the File Type Validation to prevent sending bad files to Cloudinary
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
    const { name, username, headline, industry, bio, location, linkedIn, github, website, skills, activeDirectiveIntent, activeDirectiveText } = req.body;
    
    const user = await User.findById(req.user.userId);
    if (!user) return res.status(404).json({ message: 'User not found.' });

    if (name) user.name = name;
    if (headline) user.headline = headline;
    if (industry) user.industry = industry; 
    if (bio) user.bio = bio;
    if (location) user.location = location;

    if (username && username !== user.username) {
        const formattedUsername = username.toLowerCase().replace(/\s+/g, '');
        const existingUser = await User.findOne({ username: formattedUsername });
        if (existingUser) return res.status(400).json({ message: `The username @${formattedUsername} is already taken.` });
        user.username = formattedUsername;
    }
    
    if (skills) user.skills = skills.split(',').map(skill => skill.trim());

    if (activeDirectiveIntent || activeDirectiveText) {
      if (!user.activeDirective) user.activeDirective = {};
      if (activeDirectiveIntent) user.activeDirective.intent = activeDirectiveIntent;
      if (activeDirectiveText !== undefined) user.activeDirective.text = activeDirectiveText;
    }

    if (!user.socialLinks) user.socialLinks = {};
    if (linkedIn !== undefined) user.socialLinks.linkedIn = linkedIn;
    if (github !== undefined) user.socialLinks.github = github;
    if (website !== undefined) user.socialLinks.website = website;

    if (req.files) {
        // req.files.path now contains the secure Cloudinary URL!
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
    const { title, challenge, solution, result, projectUrl, githubUrl, stack } = req.body;
    
    if (!title || !solution) {
        return res.status(400).json({ message: 'Portfolio case studies require at least a title and solution.' });
    }

    const user = await User.findById(req.user.userId);
    let imagePath = null;
    if (req.file) imagePath = req.file.path; // This is now the Cloudinary URL

    user.portfolio.push({
      title, challenge, solution, result, projectUrl, githubUrl, imageUrl: imagePath,
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

      // --- SILENT ANALYTICS ---
      trackEvent({ actor: senderId, targetUser: targetUserId, eventType: 'REVIEW_RECEIVED' });

      res.status(201).json({ message: 'Endorsement added!', testimonials: user.testimonials });
    } catch (error) {
      res.status(500).json({ message: 'Server error adding endorsement.' });
    }
});

// --- ROUTE 4: LEAVE A TRADE REVIEW (RESTORED!) ---
router.post('/:userId/review', authMiddleware, async (req, res) => {
  try {
    const { workspaceId, rating, text } = req.body;
    const targetUserId = req.params.userId;
    const senderId = req.user.userId;

    if (targetUserId === senderId) return res.status(400).json({ message: 'You cannot review yourself.' });

    const user = await User.findById(targetUserId);
    if (!user) return res.status(404).json({ message: 'User not found.' });

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

    // --- SILENT ANALYTICS ---
    trackEvent({ actor: senderId, targetUser: targetUserId, eventType: 'REVIEW_RECEIVED' });

    res.status(201).json({ message: 'Review submitted!', reviews: user.barterReviews });
  } catch (error) {
    res.status(500).json({ message: 'Server error submitting review.' });
  }
});

// --- ROUTE 5: VIEW ADVANCED PROFILE & CALCULATE REPUTATION ---
router.get('/:userId', authMiddleware, async (req, res) => {
  try {
    const targetUserId = req.params.userId;

    const userProfile = await User.findById(targetUserId)
        .select('-passwordHash')
        .populate('testimonials.author barterReviews.reviewer', 'name role profilePictureUrl username');

    if (!userProfile) return res.status(404).json({ message: 'Profile not found.' });

    // --- SILENT ANALYTICS ---
    trackEvent({
      actor: req.user.userId,
      targetUser: targetUserId,
      eventType: 'PROFILE_VIEW'
    });

    // Added Pagination/Limits to prevent database throttling
    const recentInsights = await Insight.find({ author: targetUserId }).sort({ createdAt: -1 }).limit(10);

    // --- THE REPUTATION ENGINE ALGORITHM ---
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

    // 5. PHASE 4: Event Hosting & Escrow Synergy
    const userEvents = await Event.find({ organizerId: targetUserId });
    if (userEvents && userEvents.length > 0) {
      repScore += userEvents.length * 5; // +5 points for every event hosted!
      const hasSoldOut = userEvents.some(e => e.registeredAttendees?.length >= e.maxCapacity);
      if (hasSoldOut) {
        repScore += 10;
        autoBadges.push("Ecosystem Leader");
      }
    }

    // PHASE 2: Verified Execution
    const completedBarters = await BarterWorkspace.countDocuments({
      $or: [{ initiator: targetUserId }, { partner: targetUserId }],
      status: 'Completed'
    });

    const completedMentorships = await MentorshipSession.countDocuments({
      $or: [{ mentor: targetUserId }, { mentee: targetUserId }],
      status: 'Completed'
    });

    const verifiedExecution = {
      eventsHosted: userEvents ? userEvents.length : 0,
      bartersCompleted: completedBarters,
      mentorshipsCompleted: completedMentorships
    };

    // PHASE 3: Mutual Trust Graph
    let mutualConnections = [];
    if (req.user.userId !== targetUserId) {
        const currentUser = await User.findById(req.user.userId).select('following');
        if (currentUser && currentUser.following && userProfile.followers) {
            const mutualIds = currentUser.following.filter(id => userProfile.followers.includes(id));
            mutualConnections = await User.find({ _id: { $in: mutualIds } }).select('name profilePictureUrl username').limit(5);
        }
    }

    // Cap score at 99 for realism
    repScore = Math.min(Math.max(Math.floor(repScore), 10), 99);

    res.status(200).json({ 
        profile: userProfile,
        thoughtLeadershipFeed: recentInsights,
        reputation: {
          score: repScore,
          badges: [...new Set([...(userProfile.trustBadges || []), ...autoBadges])] 
        },
        networkPulse: {
            followersCount: userProfile.followers?.length || 0,
            followingCount: userProfile.following?.length || 0
        },
        verifiedExecution,
        mutualConnections
    });
  } catch (error) {
    console.error('Fetch Profile Error:', error);
    res.status(500).json({ message: 'Server error fetching profile.' });
  }
});

module.exports = router;