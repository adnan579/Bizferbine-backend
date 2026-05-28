require('dotenv').config(); // MUST be the very first line
require('./cron/analyticsWorker'); // Wakes up the analytics aggregation engine

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const http = require('http');
const path = require('path'); // Moved to the top for best practices
const cookieParser = require('cookie-parser');
const { Server } = require('socket.io');

// --- THE DNS BYPASS ---
const dns = require('dns');
dns.setServers(['8.8.8.8', '8.8.4.4']);
// ----------------------

// 1. IMPORT ALL ROUTES CLEANLY
const authRoutes = require('./routes/auth');
const profileRoutes = require('./routes/profile');
const eventRoutes = require('./routes/events');
const dealRoutes = require('./routes/deals');
const userRoutes = require('./routes/users');
const mentorshipRoutes = require('./routes/mentorship');
const networkRoutes = require('./routes/network');
const messageRoutes = require('./routes/messages');
const insightRoutes = require('./routes/insights');
const mentorshipBoardRoutes = require('./routes/mentorshipBoard');
const paymentRoutes = require('./routes/payments');
const skillExchangeRoutes = require('./routes/skillExchange');
const notificationRoutes = require('./routes/notifications');
const searchRoutes = require('./routes/search');
const barterWorkspaceRoutes = require('./routes/barterWorkspace');
const wellnessRoutes = require('./routes/wellness');
const adminRoutes = require('./routes/admin');
const disputesRoutes = require('./routes/disputes');
const analyticsRoutes = require('./routes/analytics');
const executionRoutes = require('./routes/execution');

// Initialize the Express application
const app = express();

// --- NEW: TRUST THE RENDER PROXY FOR RATE LIMITING ---
app.set('trust proxy', 1);
// -----------------------------------------------------

// --- NEW: WEBSOCKET SERVER SETUP ---
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    // Array allows BOTH your live site and local testing to connect!
    origin: ["https://beta.setupgram.com", "http://localhost:5173", "http://localhost:3000"],
    methods: ["GET", "POST", "PUT", "DELETE"]
  }
});

// Attach 'io' to the Express app so we can use it inside our routes
app.set('io', io);

// --- THE GLOBAL WEBSOCKET ENGINE (REAL-TIME LAYER) ---
io.on('connection', (socket) => {
  console.log(`⚡ [Socket] Node Connected: ${socket.id}`);

  // When a user logs in, put them in their own private secure room
  socket.on('join_user_room', (userId) => {
    socket.join(`user_${userId}`);
    console.log(`🔒 [Socket] Node joined secure room: user_${userId}`);
  });

  // When users open a Deal Room or Barter Workspace
  socket.on('join_workspace', (workspaceId) => {
    socket.join(`workspace_${workspaceId}`);
    console.log(`🤝 [Socket] Node joined workspace: workspace_${workspaceId}`);
  });

  // 1. Global Admin Broadcasts
  socket.on('system_broadcast', (data) => {
    io.emit('system_message', data);
  });

  // 2. PHASE 1: EVENT OS PRESENCE ROOMS
  socket.on('join_event_os', ({ eventId, user }) => {
    socket.join(`event_${eventId}`);
    // Broadcast to everyone else in this specific event room that a new node joined
    socket.to(`event_${eventId}`).emit('node_entered_os', {
      message: `${user.name} has entered the active ecosystem.`,
      user: user,
      timestamp: new Date()
    });
    console.log(`[Event OS] User ${user.name} joined Event Vector ${eventId}`);
  });

  socket.on('leave_event_os', ({ eventId, user }) => {
    socket.leave(`event_${eventId}`);
  });

  socket.on('disconnect', () => {
    console.log(`🔌 [Socket] Node Disconnected: ${socket.id}`);
  });
});
// -----------------------------------

// Middleware
app.use(cors({
  origin: ["https://beta.setupgram.com", "http://localhost:5173", "http://localhost:3000"],
  credentials: true
}));
app.use(express.json());
app.use(cookieParser());

// Securely Serve the Uploads folder
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Variables from your .env file
const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGO_URI;

// --- DIAGNOSTIC TOOL ---
console.log("Diagnostic Check: Is MONGO_URI loaded?");
console.log("Value of MONGO_URI:", MONGO_URI ? "Yes, it is a string!" : "No, it is undefined.");
// -----------------------

// 2. MOUNT ALL ROUTES
app.use('/api/auth', authRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/events', eventRoutes);
app.use('/api/deals', dealRoutes);
app.use('/api/users', userRoutes);
app.use('/api/mentorship', mentorshipRoutes);
app.use('/api/network', networkRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/insights', insightRoutes);
app.use('/api/mentorship-board', mentorshipBoardRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/skill-exchange', skillExchangeRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/search', searchRoutes);
app.use('/api/barter-workspace', barterWorkspaceRoutes);
app.use('/api/wellness', wellnessRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/disputes', disputesRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/execution', executionRoutes);

// Basic Test Route
app.get('/', (req, res) => {
  res.send('Welcome to the BizFerbine API!');
});

// 3. DATABASE CONNECTION & SERVER START
mongoose.connect(MONGO_URI, {
  serverSelectionTimeoutMS: 5000,
  family: 4 // Forces IPv4 routing to bypass Windows network blocks
})
  .then(() => {
    console.log('Successfully connected to MongoDB!');
    // IMPORTANT: 'server.listen' must be used instead of 'app.listen' for WebSockets to work
    server.listen(PORT, () => console.log(`🚀 Server & WebSockets running on port ${PORT}`));
  })
  .catch((error) => {
    console.error('Error connecting to database:', error.message);
  });