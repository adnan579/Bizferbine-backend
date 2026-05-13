// routes/admin.js
const express = require('express');
const bcrypt = require('bcrypt');
// FIXED: All schemas are now properly imported!
const { User, Dispute, Deal, SkillExchange, BarterWorkspace, MentorshipApplication, Insight, Event, Connection, Notification } = require('../models/CoreSchemas');
const authMiddleware = require('../middleware/authMiddleware');

const router = express.Router();

// --- NEW: INITIALIZE & FORCE RESET SYSTEM ADMIN ---
// URL: POST /api/admin/init-overseer
router.post('/init-overseer', async (req, res) => {
  try {
    // 1. Hash the secure password
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash('Overseer2026!', salt);

    // 2. Check if the account is stuck in the database
    let adminUser = await User.findOne({ email: 'admin@bizferbine.com' });
    
    if (adminUser) {
      // IF STUCK: Force reset the password and role! No MongoDB deletion required.
      adminUser.passwordHash = passwordHash;
      adminUser.role = 'Admin';
      adminUser.status = 'Active';
      await adminUser.save();
      return res.status(200).json({ message: 'Admin Account found and FORCE RESET to default credentials!' });
    }

    // 3. IF IT DOES NOT EXIST: Create the Official Account
    adminUser = new User({
      name: 'BizFerbine',
      email: 'admin@bizferbine.com',
      passwordHash,
      role: 'Admin', // God-mode role!
      headline: 'Official Platform Administrator',
      status: 'Active'
    });

    await adminUser.save();
    res.status(201).json({ message: 'Official Admin account newly created!' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server Error setting up admin.' });
  }
});

// --- ADMIN MIDDLEWARE (Protects the routes) ---
const verifyAdmin = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.userId);
    if (user.role !== 'Admin' && user.role !== 'SuperAdmin') {
      return res.status(403).json({ message: 'Access Denied: Admin privileges required.' });
    }
    next();
  } catch (err) {
    res.status(500).json({ message: 'Server Error verifying admin.' });
  }
};

// --- ROUTE 1: GET DASHBOARD KPI STATS ---
router.get('/stats', authMiddleware, verifyAdmin, async (req, res) => {
  try {
    const totalUsers = await User.countDocuments();
    const activeDeals = await Deal.countDocuments({ status: 'Active' });
    const pendingDisputes = await Dispute.countDocuments({ status: 'Open' });
    const activeBarters = await BarterWorkspace.countDocuments({ status: 'In Progress' });

    res.status(200).json({ totalUsers, activeDeals, pendingDisputes, activeBarters });
  } catch (error) {
    res.status(500).json({ message: 'Error fetching stats.' });
  }
});

// --- ROUTE 2: GET DISPUTES ---
router.get('/disputes', authMiddleware, verifyAdmin, async (req, res) => {
  try {
    const disputes = await Dispute.find()
      .populate('reporter', 'name email profilePictureUrl')
      .sort({ createdAt: -1 });
    res.status(200).json(disputes);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching disputes.' });
  }
});

// --- ROUTE 3: UPDATE DISPUTE STATUS & ADD NOTE ---
router.put('/disputes/:id', authMiddleware, verifyAdmin, async (req, res) => {
  try {
    const { status, note } = req.body;
    const dispute = await Dispute.findById(req.params.id);
    
    if (!dispute) return res.status(404).json({ message: 'Dispute not found.' });

    if (status) dispute.status = status;
    if (note) {
      dispute.adminNotes.push({ adminId: req.user.userId, note });
    }
    
    dispute.updatedAt = Date.now();
    await dispute.save();

    res.status(200).json({ message: 'Dispute updated successfully.', dispute });
  } catch (error) {
    res.status(500).json({ message: 'Error updating dispute.' });
  }
});

// --- ROUTE 4: GET ALL USERS FOR MODERATION ---
router.get('/users', authMiddleware, verifyAdmin, async (req, res) => {
  try {
    const users = await User.find()
      .select('-passwordHash') // Hide passwords!
      .sort({ createdAt: -1 });
    res.status(200).json(users);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching users.' });
  }
});

// --- ROUTE 5: TOGGLE USER SUSPENSION ---
router.put('/users/:id/suspend', authMiddleware, verifyAdmin, async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found.' });

    if (user._id.toString() === req.user.userId) {
      return res.status(400).json({ message: 'You cannot suspend yourself.' });
    }

    user.status = user.status === 'Suspended' ? 'Active' : 'Suspended';
    await user.save();

    res.status(200).json({ message: `User account is now ${user.status}.`, user });
  } catch (error) {
    res.status(500).json({ message: 'Error updating user status.' });
  }
});

// --- ROUTE 6: DEEP ANALYTICS ---
router.get('/analytics', authMiddleware, verifyAdmin, async (req, res) => {
  try {
    const totalMentorships = await MentorshipApplication.countDocuments();
    const totalInsights = await Insight.countDocuments();
    const totalEvents = await Event.countDocuments();
    const totalConnections = await Connection.countDocuments({ status: 'Accepted' });

    res.status(200).json({ totalMentorships, totalInsights, totalEvents, totalConnections });
  } catch (error) {
    res.status(500).json({ message: 'Error fetching analytics.' });
  }
});

// --- ROUTE 7: GET WORKSPACE CHAT LOGS FOR DISPUTES ---
router.get('/workspaces/:id/logs', authMiddleware, verifyAdmin, async (req, res) => {
  try {
    // Find the workspace and populate the sender info so we know who said what
    const workspace = await BarterWorkspace.findById(req.params.id)
      .populate('messages.sender', 'name profilePictureUrl role');
      
    if (!workspace) return res.status(404).json({ message: 'Workspace not found.' });
    
    // Return just the messages array
    res.status(200).json(workspace.messages);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching chat logs.' });
  }
});

// --- ROUTE 8: GLOBAL SYSTEM BROADCAST ---
router.post('/broadcast', authMiddleware, verifyAdmin, async (req, res) => {
  try {
    const { message } = req.body;
    if (!message || message.trim() === '') {
      return res.status(400).json({ message: 'Broadcast message cannot be empty.' });
    }

    // 1. Fetch only 'Active' users (don't send to suspended accounts)
    const activeUsers = await User.find({ status: 'Active' }, '_id');

    // 2. Prepare the payload for every user
    const notifications = activeUsers.map(user => ({
      recipient: user._id,
      sender: req.user.userId, // The Admin who sent it
      type: 'System', // Matches our enum in CoreSchemas!
      message: `OVERSEER BROADCAST: ${message}`
    }));

    // 3. High-Performance Bulk Insert (Instantaneous even for 10k+ users)
    await Notification.insertMany(notifications);

    // --- NEW: WEBSOCKET TRIGGER ---
    // Instantly push the message to every single connected client
    req.app.get('io').emit('system_broadcast', `OVERSEER BROADCAST: ${message}`);

    res.status(200).json({ message: `Signal broadcasted successfully to ${activeUsers.length} active nodes.` });
  } catch (error) {
    console.error('Broadcast Error:', error);
    res.status(500).json({ message: 'Server error transmitting broadcast.' });
  }
});

// --- ROUTE 9: FETCH ALL MODERATABLE CONTENT ---
router.get('/content', authMiddleware, verifyAdmin, async (req, res) => {
  try {
    // Fetch latest 50 insights and upcoming events
    const insights = await Insight.find().populate('author', 'name email').sort({ createdAt: -1 }).limit(50);
    const events = await Event.find().populate('organizerId', 'name email').sort({ date: 1 }).limit(50);
    
    res.status(200).json({ insights, events });
  } catch (error) {
    res.status(500).json({ message: 'Error fetching platform content.' });
  }
});

// --- ROUTE 10: DELETE AN INSIGHT ---
router.delete('/content/insights/:id', authMiddleware, verifyAdmin, async (req, res) => {
  try {
    await Insight.findByIdAndDelete(req.params.id);
    res.status(200).json({ message: 'Insight permanently purged from the ecosystem.' });
  } catch (error) {
    res.status(500).json({ message: 'Error deleting insight.' });
  }
});

// --- ROUTE 11: DELETE AN EVENT ---
router.delete('/content/events/:id', authMiddleware, verifyAdmin, async (req, res) => {
  try {
    await Event.findByIdAndDelete(req.params.id);
    res.status(200).json({ message: 'Event cancelled and removed.' });
  } catch (error) {
    res.status(500).json({ message: 'Error deleting event.' });
  }
});

// --- ROUTE 12: ISSUE OFFICIAL WARNING TO A USER ---
router.post('/users/:id/warn', authMiddleware, verifyAdmin, async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found.' });

    // Send a direct System Alert to their notification bell
    const alert = new Notification({
      recipient: user._id,
      sender: req.user.userId,
      type: 'System',
      message: `OFFICIAL WARNING: Your recent activity has been flagged by Overseer Admins for violating network guidelines. Further infractions will result in an immediate hardware ban.`
    });
    
    await alert.save();
    res.status(200).json({ message: `Warning successfully transmitted to ${user.name}.` });
  } catch (error) {
    res.status(500).json({ message: 'Error issuing warning.' });
  }
});

module.exports = router;