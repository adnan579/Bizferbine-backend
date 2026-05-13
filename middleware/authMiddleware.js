const jwt = require('jsonwebtoken');
const { User } = require('../models/CoreSchemas'); // We need to pull the User database!

const authMiddleware = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'Access Denied: No Token Provided.' });
    }

    const token = authHeader.split(' ')[1];
    
    // 1. Verify the token is mathematically valid
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your_super_secret_key');
    req.user = decoded; // Attach the decoded payload to the request

    // 2. THE OVERSEER KILL SWITCH: Check if the user is suspended
    const user = await User.findById(req.user.userId);
    if (!user) {
      return res.status(404).json({ message: 'User profile not found.' });
    }
    
    if (user.status === 'Suspended') {
      return res.status(403).json({ message: 'ACCOUNT SUSPENDED: Your access to the platform has been revoked by Overseer Admins.' });
    }

    // 3. If they pass all checks, let them proceed
    next();
  } catch (error) {
    return res.status(401).json({ message: 'Session expired or invalid token.' });
  }
};

module.exports = authMiddleware;