// routes/deals.js
const express = require('express');
const mongoose = require('mongoose');
const multer = require('multer'); // Added for Document Sharing
const { sendNotification } = require('../utils/notificationHelper');
const { Deal } = require('../models/CoreSchemas');
const authMiddleware = require('../middleware/authMiddleware'); 
const governorMiddleware = require('../middleware/governorMiddleware');

const router = express.Router();

// --- MULTER CONFIGURATION FOR SECURE DOCUMENTS ---
const storage = multer.diskStorage({
  destination: function (req, file, cb) { cb(null, 'uploads/'); },
  filename: function (req, file, cb) { cb(null, 'secure-deal-' + Date.now() + '-' + file.originalname); }
});
const upload = multer({ storage: storage });

// --- ROUTE 1: CREATE A NEW DEAL ROOM ---
router.post('/', authMiddleware, async (req, res) => {
  try {
    const { title, description, targetParticipantId } = req.body;

    // FIX: Strict Validation for the MongoDB User ID
    if (targetParticipantId && !mongoose.Types.ObjectId.isValid(targetParticipantId)) {
        return res.status(400).json({ message: "Invalid User ID format. It must be a 24-character database ID." });
    }

    const newDeal = new Deal({
      title,
      description,
      initiator: req.user.userId, 
      participants: targetParticipantId ? [targetParticipantId] : [], 
      documents: []
    });

    await newDeal.save();
    res.status(201).json({ message: 'Deal Room created successfully!', deal: newDeal });
  } catch (error) {
    console.error('Deal Creation Error:', error);
    res.status(500).json({ message: 'Server error creating Deal Room.' });
  }
});

// --- ROUTE 2: SUBMIT A PROPOSAL/MESSAGE ---
router.post('/:dealId/proposals', authMiddleware, governorMiddleware, async (req, res) => {
  try {
    const { message, amount } = req.body;
    const deal = await Deal.findById(req.params.dealId);
    if (!deal) return res.status(404).json({ message: 'Deal not found.' });

    const isInitiator = deal.initiator.toString() === req.user.userId;
    const isParticipant = deal.participants.includes(req.user.userId);
    if (!isInitiator && !isParticipant) return res.status(403).json({ message: 'Access denied.' });
    if (deal.status === 'Frozen' || deal.status === 'Closed') return res.status(400).json({ message: 'This Deal Room is locked.' });

    deal.proposals.push({ senderId: req.user.userId, message, amount });
    if (deal.status === 'Open') deal.status = 'Negotiating';

    await deal.save();

    await sendNotification({
      recipient: isInitiator ? deal.participants[0] : deal.initiator,
      sender: req.user.userId,
      type: 'DealRoomUpdate',
      message: `A new proposal has been submitted to your Deal Room: "${deal.title}"`,
      targetId: deal._id
    });

    res.status(200).json({ message: 'Proposal submitted!', deal });
  } catch (error) {
    res.status(500).json({ message: 'Server error submitting proposal.' });
  }
});

// --- ROUTE 3: UPLOAD A SECURE DOCUMENT ---
router.post('/:dealId/documents', authMiddleware, upload.single('document'), async (req, res) => {
    try {
      const deal = await Deal.findById(req.params.dealId);
      if (!deal) return res.status(404).json({ message: 'Deal not found.' });
  
      const isInitiator = deal.initiator.toString() === req.user.userId;
      const isParticipant = deal.participants.includes(req.user.userId);
      if (!isInitiator && !isParticipant) return res.status(403).json({ message: 'Access denied.' });
      if (deal.status === 'Frozen' || deal.status === 'Closed') return res.status(400).json({ message: 'This Deal Room is locked.' });
  
      if (!req.file) return res.status(400).json({ message: 'No document provided.' });
  
      // Push the document path to the deal's documents array
      deal.documents.push(req.file.path);
      await deal.save();
  
      res.status(200).json({ message: 'Secure document uploaded!', deal });
    } catch (error) {
      res.status(500).json({ message: 'Server error uploading document.' });
    }
});

// --- ROUTE 4: GET ALL DEALS ---
router.get('/', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    const userDeals = await Deal.find({
      $or: [{ initiator: userId }, { participants: userId }]
    }).sort({ updatedAt: -1 }); 

    res.status(200).json(userDeals);
  } catch (error) {
    res.status(500).json({ message: 'Server error fetching deals.' });
  }
});

// --- ROUTE 5: UPDATE DEAL STATUS ---
router.put('/:dealId/status', authMiddleware, governorMiddleware, async (req, res) => {
  try {
    const { status } = req.body; 
    const deal = await Deal.findById(req.params.dealId);
    if (!deal) return res.status(404).json({ message: 'Deal not found.' });

    const isInitiator = deal.initiator.toString() === req.user.userId;
    const isParticipant = deal.participants.includes(req.user.userId);
    if (!isInitiator && !isParticipant) return res.status(403).json({ message: 'Access denied.' });
    if (deal.status === 'Frozen') return res.status(400).json({ message: 'This Deal Room has been quarantined by an Admin.' });

    deal.status = status;
    await deal.save();
    res.status(200).json({ message: `Deal status updated to ${status}!`, deal });
  } catch (error) {
    res.status(500).json({ message: 'Server error updating deal status.' });
  }
});

// --- ROUTE 6: DELETE A DEAL ROOM ---
router.delete('/:dealId', authMiddleware, async (req, res) => {
    try {
      const deal = await Deal.findById(req.params.dealId);
      if (!deal) return res.status(404).json({ message: 'Deal not found.' });
  
      // Security: Only the initiator (creator) can delete the room!
      if (deal.initiator.toString() !== req.user.userId) {
        return res.status(403).json({ message: 'Only the creator of the deal room can delete it.' });
      }
  
      await Deal.findByIdAndDelete(req.params.dealId);
      res.status(200).json({ message: 'Secure Deal Room permanently destroyed.' });
    } catch (error) {
      res.status(500).json({ message: 'Server error deleting deal.' });
    }
});

module.exports = router;