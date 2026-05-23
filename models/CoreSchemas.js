// models/CoreSchemas.js
const mongoose = require('mongoose');

// --- USER SCHEMA (ADVANCED PROFILE OVERHAUL) ---
const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  username: { type: String, unique: true, sparse: true, trim: true },
  passwordHash: { type: String, required: true },
  industry: { type: String },
  role: { type: String, enum: ['Entrepreneur', 'Mentor', 'Investor', 'Standard', 'Admin', 'SuperAdmin'], default: 'Standard' },
  status: { type: String, enum: ['Active', 'Suspended'], default: 'Active' },
  // --- NEW: AUTHENTICATION & SECURITY FIELDS ---
  isVerified: { type: Boolean, default: false }, // Blocks login until true
  verificationToken: { type: String },           // The unique email link token
  resetPasswordToken: { type: String },          // For "Forgot Password"
  resetPasswordExpires: { type: Date },          // Token expiration time
  // -------------------------------------------
  followers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  following: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  
  // 1. Dynamic Identity & Branding
  headline: { type: String, maxLength: 150 }, // Smart Headline (Value Prop)
  bio: { type: String, maxLength: 1000 }, // Keyword-Rich "About" Section
  profilePictureUrl: { type: String },
  profileBannerUrl: { type: String }, // Custom Banner
  location: { type: String }, 
  socialLinks: {
    linkedIn: { type: String },
    github: { type: String },
    website: { type: String }
  },

  // 2. Algorithmic Optimization (Skill Matrix)
  skills: [{ type: String }], 

  // 3. High-Impact Portfolio Section (Case Studies)
  portfolio: [{
    title: { type: String, required: true },
    challenge: { type: String }, // Problem being solved
    solution: { type: String },  // What was built
    result: { type: String },    // Quantifiable metrics
    projectUrl: { type: String }, // Live site
    githubUrl: { type: String },  // Repo link
    imageUrl: { type: String },   // Visual Gallery screenshot
    addedAt: { type: Date, default: Date.now }
  }],

  // Work history to validate Mentors
  experience: [{
    title: { type: String, required: true },
    company: { type: String, required: true },
    startDate: { type: Date },
    current: { type: Boolean, default: false },
    description: { type: String }
  }],

  // 4. Verification & Credibility Markers
  trustBadges: [{ type: String }], // e.g., "Verified Mentor", "Funded Entrepreneur"
  testimonials: [{
    author: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    text: { type: String, required: true },
    createdAt: { type: Date, default: Date.now }
  }],
  barterReviews: [{
    reviewer: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    workspace: { type: mongoose.Schema.Types.ObjectId, ref: 'BarterWorkspace' },
    rating: { type: Number, required: true, min: 1, max: 5 },
    text: { type: String, required: true },
    createdAt: { type: Date, default: Date.now }
  }]
}, { timestamps: true });

// --- EVENT SCHEMA ---
const eventSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: { type: String, required: true },
  type: { type: String, enum: ['Online', 'Offline'], required: true },
  locationOrLink: { type: String, required: true },
  date: { type: Date, required: true },
  organizerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  ticketPrice: { type: Number, default: 0 }, 
  maxCapacity: { type: Number, required: true },
  registeredAttendees: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }], 
  acceptsSponsors: { type: Boolean, default: false },
  sponsorshipPrice: { type: Number, default: 0 },
  sponsors: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }] 
}, { timestamps: true });

// --- DEAL ROOM SCHEMA ---
const dealSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: { type: String, required: true },
  status: { type: String, enum: ['Open', 'Negotiating', 'Accepted', 'Closed', 'Frozen'], default: 'Open' },
  initiator: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  participants: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  documents: [{ type: String }], 
  proposals: [{
    senderId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    message: { type: String, required: true },
    amount: { type: Number },
    createdAt: { type: Date, default: Date.now }
  }]
}, { timestamps: true });

// --- MENTORSHIP SCHEMA ---
const mentorshipSchema = new mongoose.Schema({
  mentee: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  mentor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  message: { type: String, required: true },
  status: { type: String, enum: ['Pending', 'Accepted', 'Declined', 'Completed'], default: 'Pending' },
  scheduledSession: { type: Date }
}, { timestamps: true });

// --- NEW: MENTORSHIP WORKSPACE & SESSION SCHEMA ---
const mentorshipSessionSchema = new mongoose.Schema({
  mentorshipConnection: { type: mongoose.Schema.Types.ObjectId, ref: 'Mentorship', required: true },
  mentor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  mentee: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  title: { type: String, required: true }, // e.g., "Onboarding & Goal Setting"
  scheduledAt: { type: Date, required: true },
  status: { type: String, enum: ['Scheduled', 'Completed', 'Canceled', 'No-Show'], default: 'Scheduled' },
  meetingLink: { type: String }, // Zoom/Google Meet link
  
  // Workspace Data
  sharedNotes: { type: String },
  actionItems: [{
    task: { type: String },
    isCompleted: { type: Boolean, default: false }
  }],
  
  // Post-Session Evaluation
  menteeFeedback: { type: String },
  mentorFeedback: { type: String }
}, { timestamps: true });

// --- NEW: MENTOR REVIEW & TRUST SCHEMA ---
const mentorReviewSchema = new mongoose.Schema({
  mentor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  mentee: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  mentorshipConnection: { type: mongoose.Schema.Types.ObjectId, ref: 'Mentorship' },
  rating: { type: Number, required: true, min: 1, max: 5 },
  reviewText: { type: String, required: true },
  skillsEndorsed: [{ type: String }], // What skills did the mentor actually help with?
  createdAt: { type: Date, default: Date.now }
});


// --- CONNECTION SCHEMA ---
const connectionSchema = new mongoose.Schema({
  requester: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  recipient: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  status: { type: String, enum: ['Pending', 'Accepted', 'Declined'], default: 'Pending' }
}, { timestamps: true });

// --- PRIVATE MESSAGE SCHEMA ---
const messageSchema = new mongoose.Schema({
  sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  recipient: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  content: { type: String, required: true },
  isRead: { type: Boolean, default: false } 
}, { timestamps: true });

// --- INDUSTRY INSIGHTS SCHEMA ---
const insightSchema = new mongoose.Schema({
  author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  title: { type: String, required: true },
  content: { 
    type: String, 
    required: true,
    validate: {
      validator: function(text) { return text.trim().split(/\s+/).length <= 120; },
      message: 'Insight content cannot exceed 120 words.'
    }
  },
  tags: [{ type: String }], 
  imageUrl: { type: String }, 
  likes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }], 
  comments: [{
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    text: { type: String, required: true },
    createdAt: { type: Date, default: Date.now }
  }],
  shareCount: { type: Number, default: 0 }
}, { timestamps: true });

// --- OPEN MENTORSHIP APPLICATION SCHEMA ---
const mentorshipApplicationSchema = new mongoose.Schema({
  mentee: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  title: { type: String, required: true },
  description: { type: String, required: true },
  industry: { type: String, required: true },
  status: { type: String, enum: ['Open', 'Matched', 'Closed'], default: 'Open' },
  offers: [{
    mentorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    message: { type: String, required: true },
    createdAt: { type: Date, default: Date.now }
  }],
  matchedMentor: { type: mongoose.Schema.Types.ObjectId, ref: 'User' } 
}, { timestamps: true });

// --- NEW: SKILL EXCHANGE SCHEMA ---
const skillExchangeSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  title: { type: String, required: true },
  description: { type: String, required: true },
  // Arrays to hold the specific skills for the barter!
  offeredSkills: [{ type: String, required: true }], 
  requiredSkills: [{ type: String, required: true }],
  status: { type: String, enum: ['Active', 'Closed'], default: 'Active' },
  proposals: [{
    senderId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    message: { type: String, required: true },
    createdAt: { type: Date, default: Date.now }
  }]
}, { timestamps: true });

// --- NOTIFICATION SCHEMA ---
const notificationSchema = new mongoose.Schema({
  recipient: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, 
  type: { 
    type: String, 
    // We are adding new types here for Deal Rooms and Insights!
    enum: ['MentorshipOffer', 'SkillProposal', 'NewFollower', 'Testimonial', 'DealRoomUpdate', 'InsightInteraction', 'System', 'NewReview', 
      'BarterProposal', 'BarterUpdate', 'ConnectionRequest', 'ConnectionAccepted'], 
    required: true 
  },
  message: { type: String, required: true }, 
  targetId: { type: mongoose.Schema.Types.ObjectId }, 
  isRead: { type: Boolean, default: false } 
}, { timestamps: true });

// --- ACTIVE BARTER WORKSPACE SCHEMA ---
const barterWorkspaceSchema = new mongoose.Schema({
  barterPost: { type: mongoose.Schema.Types.ObjectId, ref: 'SkillExchange', required: true },
  initiator: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, // The post owner
  partner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },   // The person who proposed
  status: { type: String, enum: ['Negotiating', 'In Progress', 'Completed', 'Disputed'], default: 'Negotiating' },
  messages: [{
    sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    text: String,
    // NEW: We added a type and a meetingDetails object!
    type: { type: String, enum: ['Text', 'System_Meeting'], default: 'Text' },
    meetingDetails: {
      title: String,
      date: Date,
      link: String
    },
    timestamp: { type: Date, default: Date.now }
  }],
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// --- WELLNESS LOG SCHEMA (Private & Secure) ---
const wellnessLogSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  mood: { type: String, enum: ['Excellent', 'Good', 'Neutral', 'Stressed', 'Overwhelmed'], required: true },
  note: { type: String }, // Optional journal entry
  triggers: [{ type: String }], // E.g., 'Networking', 'Deals', 'Fundraising'
  createdAt: { type: Date, default: Date.now }
});

// --- DISPUTE & MODERATION SCHEMA ---
const disputeSchema = new mongoose.Schema({
  reporter: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  reportedEntityId: { type: mongoose.Schema.Types.ObjectId, required: true }, // Can be a User, Workspace, or Post
  module: { type: String, enum: ['SkillExchange', 'DealRoom', 'Mentorship', 'Events', 'Networking', 'Wellness', 'Insights'], required: true },
  reason: { type: String, required: true },
  evidence: { type: String }, // Links to chat logs or screenshots
  status: { type: String, enum: ['Open', 'Reviewing', 'Resolved', 'Escalated'], default: 'Open' },
  adminNotes: [{
    adminId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    note: String,
    timestamp: { type: Date, default: Date.now }
  }],
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// --- NEW: ANALYTICS EVENT SCHEMA (The Silent Tracker) ---
const analyticsEventSchema = new mongoose.Schema({
  actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // Who did the action (null if anonymous)
  targetUser: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, // Who receives the dopamine
  eventType: {
    type: String,
    enum: [
      'PROFILE_VIEW', 
      'PORTFOLIO_CLICK', 
      'FOLLOW', 
      'MENTORSHIP_REQUEST', 
      'MENTORSHIP_ACCEPTED',
      'REVIEW_RECEIVED', 
      'INSIGHT_VIEW', 
      'CASE_STUDY_VIEW', 
      'GITHUB_CLICK', 
      'WEBSITE_CLICK',
      'LINKEDIN_CLICK'
    ],
    required: true
  },
  metadata: { type: mongoose.Schema.Types.Mixed }, // Flexible object for extra data (e.g., { portfolioId: '...' })
  createdAt: { type: Date, default: Date.now, expires: '90d' } // Auto-delete raw events after 90 days to save DB space!
});

// --- NEW: ANALYTICS SUMMARY SCHEMA (For Phase 2 Micro-Dopamine) ---
const analyticsSummarySchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  dailyProfileViews: { type: Number, default: 0 },
  weeklyProfileViews: { type: Number, default: 0 },
  githubClicks: { type: Number, default: 0 },
  mentorshipRequests: { type: Number, default: 0 },
  insightViews: { type: Number, default: 0 },
  calculatedAt: { type: Date, default: Date.now }
});


// Make sure to add AnalyticsEvent and AnalyticsSummary to your module.exports!

// Compile ALL blueprints
const User = mongoose.model('User', userSchema);
const Event = mongoose.model('Event', eventSchema);
const Deal = mongoose.model('Deal', dealSchema);
const Mentorship = mongoose.model('Mentorship', mentorshipSchema);
const Connection = mongoose.model('Connection', connectionSchema);
const Message = mongoose.model('Message', messageSchema); 
const Insight = mongoose.model('Insight', insightSchema); 
const MentorshipApplication = mongoose.model('MentorshipApplication', mentorshipApplicationSchema);
const SkillExchange = mongoose.model('SkillExchange', skillExchangeSchema); // New!
const Notification = mongoose.model('Notification', notificationSchema);
const BarterWorkspace = mongoose.model('BarterWorkspace', barterWorkspaceSchema); // New!
const WellnessLog = mongoose.model('WellnessLog', wellnessLogSchema); // New!
const Dispute = mongoose.model('Dispute', disputeSchema);
const MentorshipSession = mongoose.model('MentorshipSession', mentorshipSessionSchema);
const MentorReview = mongoose.model('MentorReview', mentorReviewSchema);
const AnalyticsEvent = mongoose.model('AnalyticsEvent', analyticsEventSchema);
const AnalyticsSummary = mongoose.model('AnalyticsSummary', analyticsSummarySchema);


// UPDATE YOUR EXPORTS TO INCLUDE BarterWorkspace
// Export all models
module.exports = { User, Event, Deal, Mentorship, Connection, Message, Insight, MentorshipApplication, 
  SkillExchange, Notification, BarterWorkspace, WellnessLog, 
  Dispute, MentorshipSession, MentorReview, AnalyticsEvent, AnalyticsSummary };