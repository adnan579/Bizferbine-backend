// routes/events.js
const express = require('express');
const { Event, User, Notification } = require('../models/CoreSchemas'); 
const authMiddleware = require('../middleware/authMiddleware'); // Our security guard

const router = express.Router();

// --- ROUTE 1: CREATE A NEW ADVANCED EVENT ---
// URL: POST /api/events
router.post('/', authMiddleware, async (req, res) => {
  try {
    // 1. Extract all the advanced data from the request
    const { 
      title, description, type, locationOrLink, date, 
      ticketPrice, maxCapacity, acceptsSponsors, sponsorshipPrice 
    } = req.body;

    // 2. Create the event, pulling the organizer's ID straight from their secure token
    const newEvent = new Event({
      title,
      description,
      type,
      locationOrLink,
      date,
      organizerId: req.user.userId, // Assigned automatically!
      ticketPrice: ticketPrice || 0,
      maxCapacity,
      acceptsSponsors: acceptsSponsors || false,
      sponsorshipPrice: sponsorshipPrice || 0
    });

    // 3. Save to MongoDB
    await newEvent.save();

    // --- PHASE 3: ALGORITHMIC AUDIENCE INJECTION (The Traffic Trigger) ---
    // Extract simple keywords from the title to find matching skills
    const keywords = title.toLowerCase().split(/\s+/);
    
    // Find users whose skills match these keywords, excluding the organizer
    const matchingUsers = await User.find({
      skills: { $in: keywords.map(k => new RegExp(k, 'i')) },
      _id: { $ne: req.user.userId },
      status: 'Active'
    }, '_id');

    if (matchingUsers.length > 0) {
      const notifications = matchingUsers.map(u => ({
        recipient: u._id,
        sender: req.user.userId,
        type: 'System', // Broadcast to their bell
        message: `High-Match Event: A new event "${title}" was just deployed that aligns with your skill matrix.`,
        targetId: newEvent._id
      }));
      await Notification.insertMany(notifications);
    }

    res.status(201).json({ message: 'Advanced Event created successfully!', event: newEvent });
  } catch (error) {
    console.error('Event Creation Error:', error);
    res.status(500).json({ message: 'Server error creating event.' });
  }
});

// --- ROUTE 2: GET ALL EVENTS (With Phase 1 Gatekeeper) ---
// URL: GET /api/events
router.get('/', authMiddleware, async (req, res) => {
  try {
    const events = await Event.find().sort({ date: 1 });
    
    // PHASE 1: Gatekeeping. Strip the locationOrLink if the user hasn't registered/paid.
    const secureEvents = events.map(e => {
      const eventObj = e.toObject();
      const isOrganizer = eventObj.organizerId.toString() === req.user.userId;
      const isRegistered = eventObj.registeredAttendees.map(id => id.toString()).includes(req.user.userId);
      const isSponsor = eventObj.sponsors.map(id => id.toString()).includes(req.user.userId);
      
      if (!isOrganizer && !isRegistered && !isSponsor) {
        eventObj.locationOrLink = '🔒 Secure Link (Hidden until Registration)';
      }
      return eventObj;
    });

    res.status(200).json(secureEvents);
  } catch (error) {
    console.error('Fetch Events Error:', error);
    res.status(500).json({ message: 'Server error fetching events.' });
  }
});
// --- ROUTE 3: REGISTER FOR AN EVENT (MANUAL/FREE) ---
// URL: POST /api/events/:eventId/register
// Protected by authMiddleware: We need to know exactly who is registering!
router.post('/:eventId/register', authMiddleware, async (req, res) => {
  try {
    // 1. Extract the Event ID from the URL and User ID from the secure token
    const eventId = req.params.eventId;
    const userId = req.user.userId;

    // 2. Find the requested event in the database
    const event = await Event.findById(eventId);
    
    if (!event) {
      return res.status(404).json({ message: 'Event not found.' });
    }

    // 3. Security Check: Is the user already registered?
    // We check if the userId already exists inside the registeredAttendees array
    if (event.registeredAttendees.includes(userId)) {
      return res.status(400).json({ message: 'You are already registered for this event.' });
    }

    // 4. Capacity Check: Is the event sold out?
    if (event.registeredAttendees.length >= event.maxCapacity) {
      return res.status(400).json({ message: 'Sorry, this event is at full capacity.' });
    }

    // PHASE 1: Razorpay Integration Hook
    if (event.ticketPrice > 0 && !paymentSuccess) {
      // In production, this would initialize razorpay.orders.create() and return the orderId
      return res.status(200).json({ 
        requiresPayment: true, 
        amount: event.ticketPrice,
        message: 'Redirecting to secure Razorpay checkout...' 
      });
    }

    // 5. Success! Add the user to the list and save it
    event.registeredAttendees.push(userId);
    await event.save();

    res.status(200).json({ 
      message: 'Successfully registered for the event!', 
      event 
    });

  } catch (error) {
    console.error('Registration Error:', error);
    res.status(500).json({ message: 'Server error during registration.' });
  }
});
// --- ROUTE 4: BECOME A SPONSOR FOR AN EVENT ---
// URL: POST /api/events/:eventId/sponsor
// Protected by authMiddleware
router.post('/:eventId/sponsor', authMiddleware, async (req, res) => {
  try {
    const eventId = req.params.eventId;
    const userId = req.user.userId;
    const { paymentSuccess } = req.body; // Mocked Razorpay Payload

    // 1. Find the event
    const event = await Event.findById(eventId);
    
    if (!event) {
      return res.status(404).json({ message: 'Event not found.' });
    }

    // 2. Feature Check: Does this event even accept sponsors?
    if (!event.acceptsSponsors) {
      return res.status(400).json({ message: 'This event is currently not accepting sponsors.' });
    }

    // 3. Security Check: Is the user already a sponsor?
    if (event.sponsors.includes(userId)) {
      return res.status(400).json({ message: 'You are already registered as a sponsor for this event.' });
    }

    // PHASE 1 & 4: High-Ticket Sponsorship Escrow
    if (event.sponsorshipPrice > 0 && !paymentSuccess) {
      // In production, this would route funds to an escrow account via Stripe Connect / Razorpay Route
      return res.status(200).json({ 
        requiresPayment: true, 
        amount: event.sponsorshipPrice,
        message: 'Initializing Escrow payment. Funds will be released to organizer post-event.' 
      });
    }

    // 4. Success! Add the user to the sponsors list and save
    event.sponsors.push(userId);
    await event.save();

    res.status(200).json({ 
      message: 'Successfully registered as an event sponsor!', 
      event 
    });

  } catch (error) {
    console.error('Sponsorship Error:', error);
    res.status(500).json({ message: 'Server error during sponsorship registration.' });
  }
});
module.exports = router;