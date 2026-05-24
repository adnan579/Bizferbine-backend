// routes/profile.js
const express = require('express');
const mongoose = require('mongoose');
const { sendNotification } = require('../utils/notificationHelper');
const { trackEvent } = require('../utils/analyticsHelper');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const { User, Insight, Event, BarterWorkspace, MentorshipSession, Deal, MentorReview, AnalyticsEvent, WellnessLog } = require('../models/CoreSchemas');
const authMiddleware = require('../middleware/authMiddleware');
const { GoogleGenerativeAI } = require('@google/generative-ai');

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
    allowed_formats: ['jpg', 'jpeg', 'png', 'webp', 'mp4', 'webm'],
    resource_type: 'auto'
  }
});

const upload = multer({ 
  storage: storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB Limit
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/') || file.mimetype.startsWith('video/')) cb(null, true);
    else cb(new Error('Only image and video files are permitted!'), false);
  }
});

// --- ROUTE 1: UPDATE IDENTITY & BRANDING ---
router.put('/', authMiddleware, upload.fields([
    { name: 'profilePicture', maxCount: 1 }, 
    { name: 'profileBanner', maxCount: 1 },
    { name: 'pitchVideo', maxCount: 1 }
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
        if (req.files['pitchVideo']) user.pitchVideoUrl = req.files['pitchVideo'][0].path; // Save video URL
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

    // Collect all skills endorsed from barter and mentor reviews
    const endorsedSkillsFromBarters = userProfile.barterReviews?.filter(r => r.rating >= 4).flatMap(r => r.skillsEndorsed || []) || [];
    const endorsedSkillsFromMentors = (await MentorReview.find({ mentor: targetUserId, rating: { $gte: 4 } }).select('skillsEndorsed')).flatMap(r => r.skillsEndorsed || []);
    const verifiedSkills = [...new Set([...endorsedSkillsFromBarters, ...endorsedSkillsFromMentors])]; // Unique verified skills

    // --- THE REPUTATION ENGINE ALGORITHM ---
    let repScore = 50; // Baseline score
    let autoBadges = [];

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

    // --- TASK 2: ESCROW TVL ---
    const activeDeals = await Deal.find({
        status: 'Negotiating',
        $or: [{ initiator: targetUserId }, { participants: targetUserId }]
    });
    
    let dealEscrow = 0;
    activeDeals.forEach(deal => {
        if (deal.proposals && deal.proposals.length > 0) {
            const latestAmount = deal.proposals[deal.proposals.length - 1].amount || 0;
            dealEscrow += latestAmount;
        }
    });
    
    let eventEscrow = 0;
    if (userEvents && userEvents.length > 0) {
        userEvents.forEach(e => {
            eventEscrow += (e.sponsorshipPrice || 0) * (e.sponsors?.length || 0);
        });
    }
    const escrowTVL = dealEscrow + eventEscrow;

    // --- TASK 3: ZERO-KNOWLEDGE STAMINA RING ---
    const fourteenDaysAgo = new Date();
    fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);
    const wellnessLogs = await WellnessLog.find({ user: targetUserId, createdAt: { $gte: fourteenDaysAgo } });
    
    let positiveCount = 0;
    let negativeCount = 0;
    wellnessLogs.forEach(log => {
        if (['Excellent', 'Good'].includes(log.mood)) positiveCount++;
        else if (['Stressed', 'Overwhelmed'].includes(log.mood)) negativeCount++;
    });

    let staminaStatus = 'Stable';
    if (wellnessLogs.length > 0) {
        if (positiveCount > wellnessLogs.length / 2) staminaStatus = 'Peak';
        else if (negativeCount > wellnessLogs.length / 2) staminaStatus = 'Burnout';
    }

    // Cap score at 99 for realism
    repScore = Math.min(Math.max(Math.floor(repScore), 10), 99);

    // --- TASK 4: JSON RESPONSE PAYLOAD ---
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
        verifiedSkills, // Add verified skills to the payload
        mutualConnections,
        escrowTVL,
        staminaStatus
    });
  } catch (error) {
    console.error('Fetch Profile Error:', error);
    res.status(500).json({ message: 'Server error fetching profile.' });
  }
});

// --- ROUTE 6: THE ECOSYSTEM TELEMETRY HEATMAP ---
// URL: GET /api/profile/:userId/heatmap
router.get('/:userId/heatmap', authMiddleware, async (req, res) => {
  try {
    const userId = req.params.userId;
    const heatmapData = await AnalyticsEvent.aggregate([
      { $match: { targetUser: new mongoose.Types.ObjectId(userId) } },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          count: { $sum: 1 }
        }
      },
      {
        $project: {
          _id: 0,
          date: "$_id",
          count: 1
        }
      }
    ]);
    res.status(200).json(heatmapData);
  } catch (error) {
    console.error('Heatmap Error:', error);
    res.status(500).json({ message: 'Server error retrieving telemetry.' });
  }
});

// --- ROUTE 7: SYNTHETIC NODE CHAT (AI TWIN) ---
// URL: POST /api/profile/:userId/synthetic-chat
router.post('/:userId/synthetic-chat', authMiddleware, async (req, res) => {
  try {
    const { prompt } = req.body;
    if (!prompt) return res.status(400).json({ message: 'Prompt is required.' });

    const targetUser = await User.findById(req.params.userId);
    if (!targetUser) return res.status(404).json({ message: 'User not found.' });

    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({ message: 'Synthetic Node offline: Missing Gemini API Key.' });
    }

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

    const systemInstruction = `You are the Synthetic Twin of ${targetUser.name}. Act strictly as them, responding in the first person. Base your answers entirely on this context:\nBio: ${targetUser.bio || 'Not provided'}\nSkills: ${targetUser.skills ? targetUser.skills.join(', ') : 'Not provided'}\nPortfolio: ${JSON.stringify(targetUser.portfolio || [])}\nIndustry: ${targetUser.industry || 'Not provided'}\nRole: ${targetUser.role}\nIf the user asks something outside this context, politely explain that you do not have that information in your current memory banks. Keep responses concise, professional, and slightly cyberpunk-themed.`;
    const fullPrompt = `${systemInstruction}\n\nUser Message: ${prompt}`;

    const result = await model.generateContent(fullPrompt);
    res.status(200).json({ reply: result.response.text() });
  } catch (error) {
    console.error('Synthetic Node Error:', error);
    res.status(500).json({ message: 'Synthetic Node encountered an error processing your request.' });
  }
});

module.exports = router;