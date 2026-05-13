// routes/notifications.js
const express = require('express');
const { Notification } = require('../models/CoreSchemas'); // We only need Notification here!
const authMiddleware = require('../middleware/authMiddleware');

const router = express.Router();

// --- ROUTE 1: GET UNREAD NOTIFICATIONS ---
// URL: GET /api/notifications
router.get('/', authMiddleware, async (req, res) => {
  try {
    // Correctly get userId inside the route!
    const userId = req.user.userId;

    // Fetch notifications for this user, sorted by newest first
    const alerts = await Notification.find({ recipient: userId })
      .sort({ createdAt: -1 }) // -1 means descending order (newest at the top)
      .populate('sender', 'name profilePictureUrl'); 

    // Count how many are unread to display a red badge on the frontend
    const unreadCount = alerts.filter(alert => alert.isRead === false).length;

    res.status(200).json({ unreadCount, alerts });
  } catch (error) {
    console.error('Notification Fetch Error:', error);
    res.status(500).json({ message: 'Server error fetching notifications.' });
  }
});

// --- ROUTE 2: MARK NOTIFICATION AS READ ---
// URL: PUT /api/notifications/:id/read
router.put('/:id/read', authMiddleware, async (req, res) => {
  try {
    const notificationId = req.params.id;
    const userId = req.user.userId; // Securely get the user making the request
    
    // Find the specific notification and update isRead to true
    const alert = await Notification.findOneAndUpdate(
      { _id: notificationId, recipient: userId }, // Ensures the user actually owns this notification
      { $set: { isRead: true } },
      { returnDocument: 'after' } // The fix we applied earlier!
    );

    if (!alert) return res.status(404).json({ message: 'Notification not found.' });

    res.status(200).json({ message: 'Notification marked as read.', alert });
  } catch (error) {
    console.error('Mark Read Error:', error);
    res.status(500).json({ message: 'Server error updating notification.' });
  }
});

module.exports = router;