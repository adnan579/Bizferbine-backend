// routes/search.js
const express = require('express');
const { User, Insight, Event, SkillExchange } = require('../models/CoreSchemas');
const authMiddleware = require('../middleware/authMiddleware');

const router = express.Router();

// --- ROUTE 1: GLOBAL SEARCH ENGINE ---
// URL: GET /api/search?q=keyword&role=OptionalRole
router.get('/', authMiddleware, async (req, res) => {
  try {
    const searchQuery = req.query.q;
    const roleFilter = req.query.role; // Optional: e.g., "Mentor" or "Investor"

    if (!searchQuery) {
      return res.status(400).json({ message: 'Please provide a search term.' });
    }

    // 1. Convert the search term into a case-insensitive Regular Expression
    // e.g., "react" will match "React", "REACT", and "react.js"
    const regex = new RegExp(searchQuery, 'i');

    // 2. Build the User Query
    let userQuery = {
      $or: [
        { name: regex },
        { headline: regex },
        { industry: regex },
        { skills: { $in: [regex] } } // Searches inside the skills array!
      ]
    };

    // If the user specified a role, strictly enforce it
    if (roleFilter) {
      userQuery.role = roleFilter;
    }

    // 3. LAUNCH ALL QUERIES SIMULTANEOUSLY (Lightning Fast!)
    // We use Promise.all to prevent the server from waiting for each query to finish one by one
    const [users, insights, events, skills] = await Promise.all([
      
      // Query 1: Find People
      User.find(userQuery)
        .select('name headline profilePictureUrl role industry skills') // Only send public info!
        .limit(10), // Limit results to prevent crashing the frontend

      // Query 2: Find Content/Insights
      Insight.find({
        $or: [{ title: regex }, { content: regex }, { tags: { $in: [regex] } }]
      })
      .populate('author', 'name role')
      .limit(10),

      // Query 3: Find Upcoming Events
      Event.find({
        $or: [{ title: regex }, { description: regex }]
      }).limit(10),

      // Query 4: Find Barter Opportunities (Skill Exchange)
      SkillExchange.find({
        status: 'Active',
        $or: [
          { title: regex }, 
          { offeredSkills: { $in: [regex] } }, 
          { requiredSkills: { $in: [regex] } }
        ]
      })
      .populate('user', 'name role')
      .limit(10)
    ]);

    // 4. Package the results beautifully
    res.status(200).json({
      message: `Global search results for: "${searchQuery}"`,
      results: {
        people: users,
        thoughtLeadership: insights,
        events: events,
        opportunities: skills
      }
    });

  } catch (error) {
    console.error('Search Engine Error:', error);
    res.status(500).json({ message: 'Server error processing global search.' });
  }
});

module.exports = router;