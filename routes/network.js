// routes/network.js
const express = require('express');
const { sendNotification } = require('../utils/notificationHelper');
const { User, Connection } = require('../models/CoreSchemas');
const authMiddleware = require('../middleware/authMiddleware');

const router = express.Router();

// --- ROUTE 1: TOGGLE FOLLOW / UNFOLLOW ---
router.post('/follow/:targetUserId', authMiddleware, async (req, res) => {
  try {
    const currentUserId = req.user.userId;
    const targetUserId = req.params.targetUserId;

    if (currentUserId === targetUserId) return res.status(400).json({ message: "You cannot follow yourself." });

    const currentUser = await User.findById(currentUserId);
    const targetUser = await User.findById(targetUserId);

    if (!targetUser) return res.status(404).json({ message: 'User not found.' });

    const isFollowing = currentUser.following.includes(targetUserId);

    if (isFollowing) {
      currentUser.following.pull(targetUserId);
      targetUser.followers.pull(currentUserId);
      await currentUser.save();
      await targetUser.save();
      return res.status(200).json({ message: 'Successfully unfollowed user.' });
    } else {
      currentUser.following.push(targetUserId);
      targetUser.followers.push(currentUserId);
      await currentUser.save();
      await targetUser.save();

      await sendNotification({
        recipient: targetUserId,
        sender: currentUserId,
        type: 'NewFollower',
        message: `Someone new just started following you! Check out their profile.`
      });

      return res.status(200).json({ message: 'Successfully followed user.' });
    }
  } catch (error) {
    res.status(500).json({ message: 'Server error processing follow request.' });
  }
});

// --- ROUTE 2: SEND CONNECTION REQUEST ---
router.post('/connect/:targetUserId', authMiddleware, async (req, res) => {
  try {
    const currentUserId = req.user.userId;
    const targetUserId = req.params.targetUserId;

    if (currentUserId === targetUserId) return res.status(400).json({ message: "You cannot connect with yourself." });

    const existingConnection = await Connection.findOne({
      $or: [
        { requester: currentUserId, recipient: targetUserId },
        { requester: targetUserId, recipient: currentUserId }
      ]
    });

    if (existingConnection) {
      return res.status(400).json({ message: `A connection request already exists with status: ${existingConnection.status}` });
    }

    const newConnection = new Connection({ requester: currentUserId, recipient: targetUserId });
    await newConnection.save();

    // TRIGGER NOTIFICATION FOR RECIPIENT
    await sendNotification({
      recipient: targetUserId,
      sender: currentUserId,
      type: 'ConnectionRequest', // This triggers the system alert!
      message: `You have a new pending connection request!`,
      targetId: newConnection._id
    });

    res.status(201).json({ message: 'Connection request sent successfully!', connection: newConnection });
  } catch (error) {
    res.status(500).json({ message: 'Server error sending connection request.' });
  }
});

// --- ROUTE 3: ACCEPT OR DECLINE CONNECTION REQUEST ---
router.put('/connect/:requestId/status', authMiddleware, async (req, res) => {
  try {
    const { status } = req.body; 
    const requestId = req.params.requestId;

    const connection = await Connection.findById(requestId);
    if (!connection) return res.status(404).json({ message: 'Connection request not found.' });

    if (connection.recipient.toString() !== req.user.userId) {
      return res.status(403).json({ message: 'Access denied. Only the recipient can update this request.' });
    }

    connection.status = status;
    await connection.save();

    res.status(200).json({ message: `Connection request ${status}!`, connection });
  } catch (error) {
    res.status(500).json({ message: 'Server error updating connection status.' });
  }
});

// --- ROUTE 4: GET ALL ACCEPTED CONNECTIONS ---
router.get('/connections', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    const connections = await Connection.find({
      status: 'Accepted',
      $or: [{ requester: userId }, { recipient: userId }]
    }).populate('requester recipient', 'name profilePictureUrl username role headline'); 

    const contacts = connections.map(conn => {
      return conn.requester._id.toString() === userId ? conn.recipient : conn.requester;
    });

    res.status(200).json(contacts);
  } catch (error) {
    res.status(500).json({ message: 'Server error fetching contacts.' });
  }
});

// --- ROUTE 5: GET PENDING REQUESTS ---
router.get('/pending', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    const pendingRequests = await Connection.find({
      recipient: userId,
      status: 'Pending'
    }).populate('requester', 'name profilePictureUrl username role headline');

    res.status(200).json(pendingRequests);
  } catch (error) {
    res.status(500).json({ message: 'Server error fetching pending requests.' });
  }
});

module.exports = router;