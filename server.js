require('dotenv').config(); // MUST be the very first line
require('./cron/analyticsWorker'); // Wakes up the analytics aggregation engine
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');

// --- THE DNS BYPASS ---
// Forces Node.js to use Google's Public DNS instead of the Windows local resolver.
// This bypasses Antivirus/Firewall blocks causing the ECONNREFUSED error.
const dns = require('dns');
dns.setServers(['8.8.8.8', '8.8.4.4']);
// ----------------------

// 1. IMPORT YOUR NEW ROUTES HERE
// This links to the routes/auth.js file we created earlier
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
const { Notification } = require('./models/CoreSchemas'); // Import the Notification model
const searchRoutes = require('./routes/search');
const barterWorkspaceRoutes = require('./routes/barterWorkspace'); // New route for Barter Workspace
const wellnessRoutes = require('./routes/wellness'); // New route for Wellness Logs
const adminRoutes = require('./routes/admin'); // New route for Admin Panel
const disputesRoutes = require('./routes/disputes'); // New route for Dispute Resolution System
const analyticsRoutes = require('./routes/analytics'); // New route for Analytics Tracking

// Initialize the Express application
const app = express();

// --- NEW: WEBSOCKET SERVER SETUP ---
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "https://beta.setupgram.com", // Your frontend URL
    methods: ["GET", "POST", "PUT", "DELETE"]
  }
});

// Attach 'io' to the Express app so we can use it inside our routes (like admin.js!)
app.set('io', io);

// Listen for real-time connections
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

  socket.on('disconnect', () => {
    console.log(`🔌 [Socket] Node Disconnected: ${socket.id}`);
  });
});
// -----------------------------------

// Middleware
app.use(cors());
app.use(express.json());

// Variables from your .env file
const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGO_URI;

// --- DIAGNOSTIC TOOL ---
// Keeps an eye on your database connection string
console.log("Diagnostic Check: Is MONGO_URI loaded?");
console.log("Value of MONGO_URI:", MONGO_URI ? "Yes, it is a string!" : "No, it is undefined.");
// -----------------------

// 2. TELL EXPRESS TO USE YOUR ROUTES HERE
// Any request that starts with /api/auth will be sent to your auth.js file
app.use('/api/auth', authRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/events', require('./routes/events'));
app.use('/api/deals', dealRoutes);
app.use('/api/users', userRoutes);
app.use('/api/mentorship', mentorshipRoutes);
app.use('/api/network', networkRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/insights', insightRoutes);
app.use('/uploads', express.static('uploads'));
app.use('/api/mentorship-board', mentorshipBoardRoutes);
app.use('/api/payments', paymentRoutes); 
app.use('/api/skill-exchange', skillExchangeRoutes);
app.use('/api/notifications', require('./routes/notifications')); // New route for notifications
app.use('/api/search', searchRoutes); // New route for global search engine
app.use('/api/barter-workspace', require('./routes/barterWorkspace'));
app.use('/api/wellness', require('./routes/wellness'));
app.use('/api/admin', require('./routes/admin')); // New route for admin panel
app.use('/api/disputes', require('./routes/disputes')); // New route for dispute resolution system
app.use('/api/analytics', require('./routes/analytics')); // New route for analytics tracking

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
    server.listen(PORT, () => console.log(`🚀 Server & WebSockets running on port ${PORT}`));
  })
  .catch((error) => {
    console.error('Error connecting to database:', error.message);
  });