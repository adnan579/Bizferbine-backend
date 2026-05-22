// routes/insights.js
const express = require('express');
const { sendNotification } = require('../utils/notificationHelper');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const { Insight } = require('../models/CoreSchemas');
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
    folder: 'bizferbine_insights', // Keeps feed images organized separately from profile pics
    allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
    transformation: [{ width: 1000, crop: 'limit' }] // Auto-optimizes massive images!
  }
});

// Added File Type Validation and 5MB Limit
const upload = multer({ 
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB Limit
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Only image files are permitted!'), false);
  }
});

// --- ROUTE 1: CREATE A NEW INSIGHT (With optional Image) ---
// URL: POST /api/insights
router.post('/', authMiddleware, upload.single('image'), async (req, res) => {
  try {
    // 1. DEBUGGING: Print exactly what the server received
    console.log("=== NEW INSIGHT REQUEST ===");
    console.log("Incoming Text Data (req.body):", req.body);
    console.log("Incoming File Data (req.file):", req.file);

    const { title, content, tags } = req.body;

    // 2. EARLY VALIDATION: Check if form data is actually arriving
    if (!title || !content) {
        return res.status(400).json({ 
            message: "Missing title or content. Please ensure you are sending 'multipart/form-data' with 'title' and 'content' fields." 
        });
    }

    // 3. Check if an image was uploaded and store its path
    let imagePath = null;
    if (req.file) {
      imagePath = req.file.path; // This is now the permanent Cloudinary URL!
    }

    // 4. SMART TAG PARSING: Safely handle tags whether they arrive as a string or array
    let formattedTags = [];
    if (typeof tags === 'string') {
        formattedTags = tags.split(',').map(tag => tag.trim()); // Splits and removes extra spaces
    } else if (Array.isArray(tags)) {
        formattedTags = tags;
    }

    // 5. Save to database
    const newInsight = new Insight({
      author: req.user.userId,
      title,
      content,
      tags: formattedTags,
      imageUrl: imagePath
    });

    await newInsight.save();
    res.status(201).json({ message: 'Insight published successfully!', insight: newInsight });
  } catch (error) {
    // Catch the custom 120-word limit validation error
    if (error.name === 'ValidationError') {
      return res.status(400).json({ message: error.message });
    }
    console.error('Create Insight Error:', error);
    res.status(500).json({ message: 'Server error publishing insight.' });
  }
});

// --- ROUTE 2: GET THE INSIGHTS FEED ---
// URL: GET /api/insights
router.get('/', authMiddleware, async (req, res) => {
  try {
    // Sort by newest first and grab the author's name and role for display
    const insights = await Insight.find()
      .sort({ createdAt: -1 })
      .populate('author', 'name role'); 
      
    res.status(200).json(insights);
  } catch (error) {
    console.error('Fetch Insights Error:', error);
    res.status(500).json({ message: 'Server error fetching feed.' });
  }
});

// --- ROUTE 3: TOGGLE LIKE ---
// URL: PUT /api/insights/:id/like
router.put('/:id/like', authMiddleware, async (req, res) => {
  try {
    const insightId = req.params.id;
    const userId = req.user.userId;

    const insight = await Insight.findById(insightId);
    if (!insight) return res.status(404).json({ message: 'Insight not found.' });

    const hasLiked = insight.likes.includes(userId);

    if (hasLiked) {
      // Un-like
      insight.likes.pull(userId);
      await insight.save();
      return res.status(200).json({ message: 'Insight unliked.', likesCount: insight.likes.length });
    } else {
      // Like
      insight.likes.push(userId);
      await insight.save();

      // --- NEW: TRIGGER LIKE NOTIFICATION ---
      await sendNotification({
         recipient: insight.author,
         sender: userId,
         type: 'InsightInteraction',
         message: `Someone liked your Insight!`,
         targetId: insight._id
      });
      // --------------------------------------

      return res.status(200).json({ message: 'Insight liked!', likesCount: insight.likes.length });
    }
   
  } catch (error) {
    console.error('Like Error:', error);
    res.status(500).json({ message: 'Server error updating like.' });
  }
});

// --- ROUTE 4: ADD A COMMENT ---
// URL: POST /api/insights/:id/comment
router.post('/:id/comment', authMiddleware, async (req, res) => {
  try {
    const insightId = req.params.id;
    const { text } = req.body;

    const insight = await Insight.findById(insightId);
    if (!insight) return res.status(404).json({ message: 'Insight not found.' });

    insight.comments.push({
      user: req.user.userId,
      text: text
    });

    await insight.save();
    // --- NEW: TRIGGER COMMENT NOTIFICATION ---
    await sendNotification({
      recipient: insight.author,
      sender: req.user.userId,
      type: 'InsightInteraction',
      message: `Someone commented on your Insight: "${text.substring(0, 20)}..."`,
      targetId: insight._id
    });
    // -----------------------------------------
    res.status(201).json({ message: 'Comment added!', insight });
  } catch (error) {
    console.error('Comment Error:', error);
    res.status(500).json({ message: 'Server error adding comment.' });
  }
});

module.exports = router;