// routes/messages.js
const express = require('express');
const { Message, Connection } = require('../models/CoreSchemas');
const authMiddleware = require('../middleware/authMiddleware');

const router = express.Router();

// --- ROUTE 1: SEND A PRIVATE MESSAGE ---
// URL: POST /api/messages/:recipientId
router.post('/:recipientId', authMiddleware, async (req, res) => {
  try {
    const senderId = req.user.userId;
    const recipientId = req.params.recipientId;
    const { content } = req.body;

    // 1. Security Check: Are these two users actually connected?
    const validConnection = await Connection.findOne({
      status: 'Accepted',
      $or: [
        { requester: senderId, recipient: recipientId },
        { requester: recipientId, recipient: senderId }
      ]
    });

    if (!validConnection) {
      return res.status(403).json({ message: 'You can only send messages to accepted connections.' });
    }

    // 2. Create and save the message
    const newMessage = new Message({
      sender: senderId,
      recipient: recipientId,
      content: content
    });

    await newMessage.save();

    res.status(201).json({ message: 'Message sent successfully!', data: newMessage });
  } catch (error) {
    console.error('Messaging Error:', error);
    res.status(500).json({ message: 'Server error sending message.' });
  }
});

// --- ROUTE 2: GET CONVERSATION HISTORY ---
// URL: GET /api/messages/:otherUserId
router.get('/:otherUserId', authMiddleware, async (req, res) => {
  try {
    const currentUserId = req.user.userId;
    const otherUserId = req.params.otherUserId;

    // Find all messages between these two specific users, sorted oldest to newest
    const conversation = await Message.find({
      $or: [
        { sender: currentUserId, recipient: otherUserId },
        { sender: otherUserId, recipient: currentUserId }
      ]
    }).sort({ createdAt: 1 });

    res.status(200).json(conversation);
  } catch (error) {
    console.error('Fetch Messages Error:', error);
    res.status(500).json({ message: 'Server error fetching conversation.' });
  }
});

module.exports = router;