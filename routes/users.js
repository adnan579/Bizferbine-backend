// routes/users.js
const express = require('express');
const { User } = require('../models/CoreSchemas');
const authMiddleware = require('../middleware/authMiddleware');

const router = express.Router();

// --- ROUTE 1: SEARCH AND FILTER USERS (UPGRADED) ---
// URL: GET /api/users?q=adnan
router.get('/', authMiddleware, async (req, res) => {
  try {
    const { role, industry, q } = req.query;
    let searchQuery = {};
    
    if (role) searchQuery.role = role;
    if (industry) searchQuery.industry = industry;

    // THE UPGRADE: Regex matching for global text search
    if (q) {
        searchQuery.$or = [
            { name: { $regex: q, $options: 'i' } },       // 'i' makes it case-insensitive
            { username: { $regex: q, $options: 'i' } },
            { headline: { $regex: q, $options: 'i' } },
            { skills: { $regex: q, $options: 'i' } }      // Search by tech stack!
        ];
    }

    const users = await User.find(searchQuery).select('-passwordHash');
    res.status(200).json(users);
  } catch (error) {
    console.error('User Search Error:', error);
    res.status(500).json({ message: 'Server error searching for users.' });
  }
});

module.exports = router;