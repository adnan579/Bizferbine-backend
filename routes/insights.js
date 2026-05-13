// routes/insights.js
const express = require('express');
const { sendNotification } = require('../utils/notificationHelper');
const multer = require('multer');
const { Insight } = require('../models/CoreSchemas');
const authMiddleware = require('../middleware/authMiddleware');

const router = express.Router();

// --- MULTER CONFIGURATION FOR IMAGES ---
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/'); // Saves files to the 'uploads' folder
  },
  filename: function (req, file, cb) {
    // Adds a timestamp to prevent overwriting files with the same name
    cb(null, Date.now() + '-' + file.originalname); 
  }
});
const upload = multer({ storage: storage });

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
      imagePath = req.file.path;
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