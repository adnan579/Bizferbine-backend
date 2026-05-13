// routes/skillExchange.js
// routes/skillExchange.js
const express = require('express');
const { SkillExchange, Notification } = require('../models/CoreSchemas'); // Both models imported cleanly on one line!
const authMiddleware = require('../middleware/authMiddleware');

const router = express.Router();

// --- ROUTE 1: CREATE A SKILL EXCHANGE POST ---
// URL: POST /api/skill-exchange
router.post('/', authMiddleware, async (req, res) => {
  try {
    const { title, description, offeredSkills, requiredSkills } = req.body;

    if (!offeredSkills || !requiredSkills || offeredSkills.length === 0 || requiredSkills.length === 0) {
      return res.status(400).json({ message: 'You must provide at least one offered skill and one required skill.' });
    }

    const newPost = new SkillExchange({
      user: req.user.userId,
      title,
      description,
      // Convert arrays of strings to standard formats
      offeredSkills: offeredSkills.map(skill => skill.trim()),
      requiredSkills: requiredSkills.map(skill => skill.trim())
    });

    await newPost.save();
    res.status(201).json({ message: 'Skill exchange listing created!', post: newPost });
  } catch (error) {
    console.error('Skill Exchange Create Error:', error);
    res.status(500).json({ message: 'Server error creating listing.' });
  }
});

// --- ROUTE 2: THE TWO-WAY MATCHING ALGORITHM ---
// URL: GET /api/skill-exchange/:postId/matches
router.get('/:postId/matches', authMiddleware, async (req, res) => {
  try {
    const postId = req.params.postId;
    const userId = req.user.userId;

    // 1. Find the user's specific post so we know what they have and need
    const myPost = await SkillExchange.findById(postId);
    if (!myPost) return res.status(404).json({ message: 'Listing not found.' });

    // 2. Convert the skills into Case-Insensitive Regular Expressions
    const myOfferedRegex = myPost.offeredSkills.map(skill => new RegExp(skill, 'i'));
    const myRequiredRegex = myPost.requiredSkills.map(skill => new RegExp(skill, 'i'));

    // 3. The 2-Way Query:
    // - Their offered skills must match my required skills
    // - Their required skills must match my offered skills
    // - It must not be my own post
    const matches = await SkillExchange.find({
      status: 'Active',
      user: { $ne: userId }, 
      offeredSkills: { $in: myRequiredRegex }, 
      requiredSkills: { $in: myOfferedRegex }  
    }).populate('user', 'name email role');

    res.status(200).json({
      message: `Found ${matches.length} perfect skill exchange matches!`,
      matches
    });
  } catch (error) {
    console.error('Skill Match Error:', error);
    res.status(500).json({ message: 'Server error finding matches.' });
  }
});

// --- ROUTE 3: SEND A PROPOSAL FOR AN EXCHANGE ---
router.post('/:postId/propose', authMiddleware, async (req, res) => {
  try {
    const postId = req.params.postId;
    const { message } = req.body;
    const senderId = req.user.userId;

    const post = await SkillExchange.findById(postId);
    if (!post) return res.status(404).json({ message: 'Listing not found.' });

    if (post.user.toString() === senderId) {
        return res.status(400).json({ message: 'You cannot send a proposal to your own listing.' });
    }

    // Checking for duplicates
    const alreadyProposed = post.proposals.some(proposal => proposal.senderId.toString() === senderId);
    if (alreadyProposed) return res.status(400).json({ message: 'Duplicate proposal detected.' });

    post.proposals.push({ senderId, message });
    await post.save();

    // --- DEBUG LOGS START ---
    console.log("--- Notification Trigger Started ---");
    console.log("Recipient (Post Owner):", post.user);
    console.log("Sender (Proposer):", senderId);
    // --- DEBUG LOGS END ---

    const alert = new Notification({
      recipient: post.user, 
      sender: senderId,     
      type: 'SkillProposal',
      message: `New proposal for: "${post.title}"`,
      targetId: post._id
    });

    await alert.save();
    console.log("Notification saved successfully to Database!");

    res.status(201).json({ message: 'Proposal and Notification sent!', post });
  } catch (error) {
    console.error('Proposal/Notification Error:', error);
    res.status(500).json({ message: 'Server error.' });
  }
});
// --- ROUTE 4: GET ALL SKILL EXCHANGE POSTS (GLOBAL FEED) ---
// URL: GET /api/skill-exchange
router.get('/', authMiddleware, async (req, res) => {
  try {
    const posts = await SkillExchange.find()
      .sort({ _id: -1 })
      .populate('user', 'name role profilePictureUrl username');
    
    res.status(200).json(posts);
  } catch (error) {
    console.error('Fetch Skill Exchange Error:', error);
    res.status(500).json({ message: 'Server error fetching listings.' });
  }
});

// --- ROUTE 5: DELETE A LISTING ---
// URL: DELETE /api/skill-exchange/:id
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const post = await SkillExchange.findById(req.params.id);
    if (!post) return res.status(404).json({ message: 'Listing not found.' });

    // Security Check
    if (post.user.toString() !== req.user.userId) {
      return res.status(403).json({ message: 'Unauthorized to delete this post.' });
    }

    await SkillExchange.findByIdAndDelete(req.params.id);
    res.status(200).json({ message: 'Listing permanently removed.' });
  } catch (error) {
    res.status(500).json({ message: 'Server error deleting listing.' });
  }
});
module.exports = router;