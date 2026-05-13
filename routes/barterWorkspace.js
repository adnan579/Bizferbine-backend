// routes/barterWorkspace.js
const express = require('express');
const { BarterWorkspace, SkillExchange, Notification } = require('../models/CoreSchemas');
const authMiddleware = require('../middleware/authMiddleware');
const router = express.Router();

// --- ROUTE 1: ACCEPT PROPOSAL & CREATE WORKSPACE ---
router.post('/accept-proposal', authMiddleware, async (req, res) => {
  try {
    const { postId, partnerId } = req.body;
    const userId = req.user.userId;

    const post = await SkillExchange.findById(postId);
    if (!post) return res.status(404).json({ message: 'Post not found.' });
    if (post.user.toString() !== userId) return res.status(403).json({ message: 'Unauthorized.' });

    // Check if workspace already exists for this exact pair and post
    const existing = await BarterWorkspace.findOne({ barterPost: postId, partner: partnerId });
    if (existing) return res.status(400).json({ message: 'Workspace already exists for this proposal.' });

    const workspace = new BarterWorkspace({
      barterPost: postId,
      initiator: userId,
      partner: partnerId
    });

    await workspace.save();

    // Notify the partner that their proposal was accepted!
    const alert = new Notification({
      recipient: partnerId,
      sender: userId,
      type: 'SkillProposal',
      message: `Your trade proposal for "${post.title}" was accepted! The Barter Workspace is now active.`,
      targetId: workspace._id
    });
    await alert.save();

    res.status(201).json({ message: 'Workspace initialized!', workspace });
  } catch (error) {
    res.status(500).json({ message: 'Server error creating workspace.' });
  }
});

// --- ROUTE 2: GET USER'S WORKSPACES ---
router.get('/', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    const workspaces = await BarterWorkspace.find({
      $or: [{ initiator: userId }, { partner: userId }]
    })
    .populate('barterPost', 'title offeredSkills requiredSkills')
    .populate('initiator partner', 'name profilePictureUrl username role')
    .sort({ updatedAt: -1 });

    res.status(200).json(workspaces);
  } catch (error) {
    res.status(500).json({ message: 'Server error fetching workspaces.' });
  }
});

// --- ROUTE 3: SEND WORKSPACE MESSAGE ---
router.post('/:id/message', authMiddleware, async (req, res) => {
  try {
    const workspace = await BarterWorkspace.findById(req.params.id);
    if (!workspace) return res.status(404).json({ message: 'Workspace not found.' });

    workspace.messages.push({
      sender: req.user.userId,
      text: req.body.text
    });
    workspace.updatedAt = Date.now();
    await workspace.save();

    res.status(200).json(workspace);
  } catch (error) {
    res.status(500).json({ message: 'Server error sending message.' });
  }
});

// --- ROUTE 4: UPDATE STATUS ---
router.put('/:id/status', authMiddleware, async (req, res) => {
  try {
    const workspace = await BarterWorkspace.findById(req.params.id);
    if (!workspace) return res.status(404).json({ message: 'Workspace not found.' });

    workspace.status = req.body.status;
    workspace.updatedAt = Date.now();
    await workspace.save();

    res.status(200).json(workspace);
  } catch (error) {
    res.status(500).json({ message: 'Server error updating status.' });
  }
});

// --- ROUTE 5: SCHEDULE A CALENDAR SYNC ---
// URL: POST /api/barter-workspace/:id/schedule
router.post('/:id/schedule', authMiddleware, async (req, res) => {
  try {
    const { title, date, link } = req.body;
    const workspace = await BarterWorkspace.findById(req.params.id);
    
    if (!workspace) return res.status(404).json({ message: 'Workspace not found.' });

    const otherUserId = workspace.initiator.toString() === req.user.userId 
                        ? workspace.partner 
                        : workspace.initiator;

    // Push a "System_Meeting" message into the chat feed!
    workspace.messages.push({
      sender: req.user.userId,
      text: `Scheduled a video sync: ${title}`,
      type: 'System_Meeting',
      meetingDetails: { title, date, link }
    });
    
    workspace.updatedAt = Date.now();
    await workspace.save();

    // Trigger a glowing notification for the partner
    const alert = new Notification({
      recipient: otherUserId,
      sender: req.user.userId,
      type: 'DealRoomUpdate', 
      message: `A new video sync "${title}" was scheduled in your Barter Workspace.`,
      targetId: workspace._id
    });
    await alert.save();

    res.status(200).json(workspace);
  } catch (error) {
    console.error("Schedule Error:", error);
    res.status(500).json({ message: 'Server error scheduling meeting.' });
  }
});
module.exports = router;