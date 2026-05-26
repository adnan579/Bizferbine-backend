// routes/wellness.js
const express = require('express');
const { WellnessLog } = require('../models/CoreSchemas');
const authMiddleware = require('../middleware/authMiddleware');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const router = express.Router();

// --- ROUTE 0: ANALYZE THOUGHT (Aegis Protocol Phase 2) ---
router.post('/analyze-thought', authMiddleware, async (req, res) => {
  try {
    const { note } = req.body;
    
    if (!note || note.trim().length < 10) {
      return res.status(200).json({ bypass: true });
    }

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({
      model: "gemini-2.5-flash",
      systemInstruction: "You are a clinical Cognitive Behavioral Therapy (CBT) analyzer. Read the user's note and determine if there are explicit 'Cognitive Distortions' (e.g., Catastrophizing, Black-and-White Thinking, Fortune Telling). Return your response strictly as a JSON object with the following structure: { \"hasDistortion\": boolean, \"distortionsDetected\": [\"list\", \"of\", \"distortions\"], \"socraticQuestion\": \"A single, challenging question asking the user to provide objective evidence against their negative thought.\" }. Do not include markdown formatting or backticks around the JSON."
    });

    const prompt = `Analyze this thought: "${note}"`;
    const result = await model.generateContent(prompt);
    const responseText = result.response.text().replace(/```json/gi, '').replace(/```/g, '').trim();
    
    const jsonResponse = JSON.parse(responseText);
    res.status(200).json(jsonResponse);
  } catch (error) {
    console.error('Cognitive Compiler Error:', error);
    res.status(200).json({ bypass: true });
  }
});

// --- ROUTE 1: LOG MOOD & JOURNAL ---
router.post('/log', authMiddleware, async (req, res) => {
  try {
    const { mood, note, triggers } = req.body;
    
    const newLog = new WellnessLog({
      user: req.user.userId,
      mood,
      note,
      triggers: triggers || []
    });

    await newLog.save();
    res.status(201).json({ message: 'Wellness log securely saved.', log: newLog });
  } catch (error) {
    console.error('Wellness Log Error:', error);
    res.status(500).json({ message: 'Server error saving wellness data.' });
  }
});

// --- ROUTE 2: GET USER'S RECENT LOGS ---
router.get('/logs', authMiddleware, async (req, res) => {
  try {
    const logs = await WellnessLog.find({ user: req.user.userId })
      .sort({ createdAt: -1 })
      .limit(14); // Get last 14 entries for trend mapping
    
    res.status(200).json(logs);
  } catch (error) {
    res.status(500).json({ message: 'Server error fetching wellness logs.' });
  }
});

module.exports = router;