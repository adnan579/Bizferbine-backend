// routes/events.js
const express = require('express');
const { Event, User, Notification, EventIntelligence } = require('../models/CoreSchemas');
const authMiddleware = require('../middleware/authMiddleware'); // Our security guard
const { matchmakingQueue } = require('../utils/queueEngine');
const { compileEventIntelligence } = require('../utils/intelligenceEngine');

const router = express.Router();

// --- ROUTE 1: CREATE A NEW ADVANCED EVENT ---
// URL: POST /api/events
router.post('/', authMiddleware, async (req, res) => {
  try {
    // 1. Extract all the advanced data from the request
    const {
      title, description, type, locationOrLink, date,
      ticketTiers, acceptsSponsors, sponsorshipPrice
    } = req.body;

    // Extract backwards compatibility properties
    const derivedPrice = ticketTiers && ticketTiers.length > 0 ? ticketTiers[0].price : 0;
    const derivedCapacity = ticketTiers && ticketTiers.length > 0 ? ticketTiers.reduce((sum, t) => sum + (Number(t.capacity) || 0), 0) : 100;

    // 2. Create the event, pulling the organizer's ID straight from their secure token
    const newEvent = new Event({
      title,
      description,
      type,
      locationOrLink,
      date,
      organizerId: req.user.userId, // Assigned automatically!
      ticketPrice: derivedPrice,
      maxCapacity: derivedCapacity,
      ticketTiers: ticketTiers || [], // Tiered ticketing array
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
    const { paymentSuccess, tierName } = req.body; // Mocked Razorpay Payload + Tier selection

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

    // 4. Base Capacity Check: Is the event sold out? (Could be enhanced to check specific tier availability)
    if (event.registeredAttendees.length >= event.maxCapacity) {
      return res.status(400).json({ message: 'Sorry, this event is at full capacity.' });
    }

    const activePrice = tierName && event.ticketTiers && event.ticketTiers.length > 0 ? event.ticketTiers.find(t => t.name === tierName)?.price : event.ticketPrice;

    // PHASE 1: Razorpay Integration Hook
    if (activePrice > 0 && !paymentSuccess) {
      return res.status(200).json({
        requiresPayment: true,
        amount: activePrice,
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

// --- ROUTE 5: ORGANIZER COMMAND CENTER (Fetch Attendees & Revenue) ---
// URL: GET /api/events/:eventId/manage
router.get('/:eventId/manage', authMiddleware, async (req, res) => {
  try {
    // 1. Fetch the event and populate the attendee profiles so the UI can show their names/faces
    const event = await Event.findById(req.params.eventId)
      .populate('registeredAttendees', 'name role profilePictureUrl');

    if (!event) return res.status(404).json({ message: 'Event not found.' });

    // 2. Security Check: Only the organizer can access this data!
    if (event.organizerId.toString() !== req.user.userId) {
      return res.status(403).json({ message: 'Access Denied: You are not the organizer of this event.' });
    }

    // 3. Calculate Escrow Revenue (Tickets + Sponsorships)
    const revenue = (event.ticketPrice * event.registeredAttendees.length) +
      (event.sponsorshipPrice * event.sponsors.length);

    res.status(200).json({
      event,
      attendees: event.registeredAttendees,
      revenue
    });
  } catch (error) {
    console.error('Command Center Error:', error);
    res.status(500).json({ message: 'Server error loading Command Center.' });
  }
});

// --- ROUTE 6: ORGANIZER BROADCAST (Ping all attendees) ---
// URL: POST /api/events/:eventId/broadcast
router.post('/:eventId/broadcast', authMiddleware, async (req, res) => {
  try {
    const { message } = req.body;
    const event = await Event.findById(req.params.eventId);

    if (!event) return res.status(404).json({ message: 'Event not found.' });

    // Security Check
    if (event.organizerId.toString() !== req.user.userId) {
      return res.status(403).json({ message: 'Access Denied.' });
    }

    if (!message || message.trim() === '') {
      return res.status(400).json({ message: 'Broadcast message cannot be empty.' });
    }

    // Prepare notifications for every single registered attendee
    const notifications = event.registeredAttendees.map(attendeeId => ({
      recipient: attendeeId,
      sender: req.user.userId,
      type: 'System',
      message: `EVENT UPDATE ("${event.title}"): ${message}`,
      targetId: event._id
    }));

    // Mass insert for high performance
    if (notifications.length > 0) {
      await Notification.insertMany(notifications);
    }

    res.status(200).json({ message: 'Broadcast transmitted to all registered nodes.' });
  } catch (error) {
    console.error('Broadcast Error:', error);
    res.status(500).json({ message: 'Server error transmitting broadcast.' });
  }
});

const { EventRegistration, EventSession, EventOutcome, SponsorAction } = require('../models/CoreSchemas');

// ROUTE A: Register Intent (Intent × Capability × Availability Input)
router.post('/:eventId/register-intent', authMiddleware, async (req, res) => {
  try {
    const { attendingPurpose, specificLookingFor, weekendAvailabilityOnly, earlyStageFocus, geographicRegion } = req.body;
    const existingReg = await EventRegistration.findOne({ event: req.params.eventId, user: req.user.userId });
    if (existingReg) return res.status(400).json({ message: 'User already registered with intent for this event block.' });

    const newReg = new EventRegistration({
      event: req.params.eventId, user: req.user.userId,
      attendingPurpose, specificLookingFor, weekendAvailabilityOnly, earlyStageFocus, geographicRegion
    });
    await newReg.save();

    // Trigger background mission brief compilation via Redis Queue
    await matchmakingQueue.add('compileBrief', { eventId: req.params.eventId, userId: req.user.userId });

    await EventOutcome.findOneAndUpdate({ event: req.params.eventId }, { $inc: { registrationsCount: 1 } }, { upsert: true });
    res.status(201).json({ message: 'Intent profile registered successfully.', registration: newReg });
  } catch (err) { res.status(500).json({ message: 'Server compilation error.' }); }
});

// ROUTE B: Fetch Operating System Agenda Components (Rooms, Lobby, People)
router.get('/:eventId/operating-system', authMiddleware, async (req, res) => {
  try {
    const sessions = await EventSession.find({ event: req.params.eventId }).sort({ startTime: 1 });
    const attendees = await EventRegistration.find({ event: req.params.eventId }).populate('user', 'name role headline skills');
    res.status(200).json({ sessions, attendees });
  } catch (err) { res.status(500).json({ message: 'Failed to stream operating system data.' }); }
});

// ROUTE C: Stream Live Event Social Pulse Feed (Vector 1 & Vector 4 Integration)
router.get('/:eventId/pulse', authMiddleware, async (req, res) => {
  try {
    const { eventId } = req.params;

    // Fetch outcomes telemetry
    let outcomes = await EventOutcome.findOne({ event: eventId });
    if (!outcomes) {
      outcomes = { registrationsCount: 0, actualAttendanceCount: 0, connectionsTriggered: 0, workspacesSpawned: 0 };
    }

    // Fetch recent registration pings for the "Who Joined Recently" ticker
    const recentRegistrations = await EventRegistration.find({ event: eventId })
      .sort({ createdAt: -1 })
      .limit(3)
      .populate('user', 'name role profilePictureUrl');

    res.status(200).json({
      pulse: {
        activeNetworkingCount: outcomes.registrationsCount + 3, // Simulated live threshold
        workspacesCreatedToday: outcomes.workspacesSpawned,
        connectionsFormed: outcomes.connectionsTriggered,
        recentJoiners: recentRegistrations.map(r => ({
          name: r.user?.name || 'Anonymous Founder',
          role: r.user?.role || 'Builder',
          pic: r.user?.profilePictureUrl || ''
        }))
      }
    });
  } catch (err) {
    res.status(500).json({ message: 'Error streaming ecosystem telemetry pulse.' });
  }
});

// --- ROUTE D: EVENT STATE MACHINE CONTROLLER ---
// URL: PUT /api/events/:eventId/state
router.put('/:eventId/state', authMiddleware, async (req, res) => {
  try {
    const { eventId } = req.params;
    const { targetState } = req.body;
    const userId = req.user.userId;

    // 1. Verify Ownership
    const event = await Event.findById(eventId);
    if (!event) return res.status(404).json({ message: 'Event not found.' });
    if (event.organizerId.toString() !== userId) {
      return res.status(403).json({ message: 'Only the Event Organizer can alter platform states.' });
    }

    // 2. Execute the secure Mongoose static transition
    const updatedEvent = await Event.transitionState(eventId, targetState);

    // PHASE 4: TRIGGER INTELLIGENCE COMPILATION ON END
    if (targetState === 'Ended' || targetState === 'ENDED') {
      // Fire and forget - don't block the API response
      compileEventIntelligence(eventId).catch(err => console.error("AI Compilation Error:", err));
    }

    res.status(200).json({
      message: `Event successfully transitioned to ${targetState}`,
      event: updatedEvent
    });
  } catch (error) {
    res.status(400).json({ message: error.message || 'State transition failed.' });
  }
});

// --- ROUTE E: FETCH EVENT INTELLIGENCE (AI POST-MORTEM) ---
// URL: GET /api/events/:eventId/intelligence
router.get('/:eventId/intelligence', authMiddleware, async (req, res) => {
  try {
    const intelligence = await EventIntelligence.findOne({ event: req.params.eventId })
      .populate('topBuilders.user', 'name profilePictureUrl role');

    if (!intelligence) return res.status(404).json({ message: 'AI Intelligence compilation pending or unavailable.' });

    res.status(200).json(intelligence);
  } catch (error) {
    console.error('Intelligence Fetch Error:', error);
    res.status(500).json({ message: 'Server error retrieving AI artifact.' });
  }
});

// --- ROUTE F: ADD TIMELINE AGENDA SESSION (ORGANIZER ONLY) ---
// URL: POST /api/events/:eventId/sessions
router.post('/:eventId/sessions', authMiddleware, async (req, res) => {
  try {
    const { title, roomName, startTime, endTime, deliverables } = req.body;
    const event = await Event.findById(req.params.eventId);

    if (!event) return res.status(404).json({ message: 'Event not found.' });
    if (event.organizerId.toString() !== req.user.userId) {
      return res.status(403).json({ message: 'Only the organizer can modify the timeline.' });
    }

    const newSession = new EventSession({
      event: req.params.eventId,
      title, roomName, startTime, endTime,
      deliverables: deliverables ? deliverables.split(',').map(d => d.trim()) : []
    });

    await newSession.save();
    res.status(201).json({ message: 'Agenda track locked in.', session: newSession });
  } catch (error) {
    res.status(500).json({ message: 'Server error compiling agenda session.' });
  }
});

// --- ROUTE G: SPONSOR OPERATOR ACTION DEPLOYMENT ---
// URL: POST /api/events/:eventId/sponsor-action
router.post('/:eventId/sponsor-action', authMiddleware, async (req, res) => {
  try {
    const { capabilities, details } = req.body;
    const event = await Event.findById(req.params.eventId);

    if (!event) return res.status(404).json({ message: 'Event offline.' });
    if (!event.sponsors.includes(req.user.userId)) {
      return res.status(403).json({ message: 'Access Denied: Only verified sponsors can deploy actions.' });
    }

    const newAction = new SponsorAction({
      event: req.params.eventId,
      sponsor: req.user.userId,
      capabilities,
      details
    });

    await newAction.save();
    res.status(201).json({ message: `${capabilities} successfully deployed to the event grid.`, action: newAction });
  } catch (error) {
    res.status(500).json({ message: 'Server error deploying sponsor action.' });
  }
});

module.exports = router;