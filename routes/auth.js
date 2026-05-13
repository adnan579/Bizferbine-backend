// routes/auth.js
const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const crypto = require('crypto'); // Built into Node.js
const { User } = require('../models/CoreSchemas');
const { sendVerificationEmail } = require('../utils/emailHelper');

const router = express.Router();

// --- ROUTE 1: REGISTER WITH VERIFICATION ---
router.post('/register', async (req, res) => {
  try {
    const { name, email, password, role } = req.body;

    const existingUser = await User.findOne({ email });
    if (existingUser) return res.status(400).json({ message: 'User already exists.' });

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    // --- ADD THIS SAFETY NET ---
    const validRoles = ['Entrepreneur', 'Mentor', 'Investor', 'Standard', 'Admin', 'SuperAdmin'];
    const assignedRole = validRoles.includes(role) ? role : 'Standard';

    // Generate a secure random token for email verification (DECLARED ONLY ONCE NOW!)
    const verificationToken = crypto.randomBytes(32).toString('hex');

    const newUser = new User({
      name,
      email,
      passwordHash,
      role: assignedRole, // Uses our safety net!
      isVerified: false,  // LOCK THE ACCOUNT
      verificationToken
    });

    await newUser.save();

    // Transmit the verification email asynchronously
    try {
      await sendVerificationEmail(email, name, verificationToken);
    } catch (emailErr) {
      console.error("Email dispatch failed:", emailErr);
      // We still return 201, but the user will need to request a new link later if it fails
    }

    res.status(201).json({ message: 'Node registered! Please check your email to verify your identity before logging in.' });
  } catch (error) {
    res.status(500).json({ message: 'Server error during registration.' });
  }
});

// --- ROUTE 2: VERIFY EMAIL LINK ---
router.get('/verify/:token', async (req, res) => {
  try {
    const user = await User.findOne({ verificationToken: req.params.token });
    
    if (!user) return res.status(400).json({ message: 'Invalid or expired verification link.' });

    // Unlock the account!
    user.isVerified = true;
    user.verificationToken = undefined; // Clear the token so it can't be used again
    await user.save();

    res.status(200).json({ message: 'Identity verified successfully! You may now log in.' });
  } catch (error) {
    res.status(500).json({ message: 'Server error during verification.' });
  }
});

// --- ROUTE 3: HIGH-SECURITY LOGIN ---
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ message: 'Invalid credentials.' });

    // 1. THE SUSPENSION LOCK
    if (user.status === 'Suspended') {
      return res.status(403).json({ message: 'ACCOUNT SUSPENDED: Your access has been revoked by Overseer Admins.' });
    }

    // 2. THE EMAIL VERIFICATION LOCK
    // (We bypass this lock for Admins so you don't lock yourself out of the Overseer portal!)
    if (!user.isVerified && user.role !== 'Admin' && user.role !== 'SuperAdmin') {
      return res.status(403).json({ message: 'UNVERIFIED NODE: Please check your email to verify your identity before logging in.' });
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) return res.status(400).json({ message: 'Invalid credentials.' });

    const token = jwt.sign(
      { userId: user._id, role: user.role },
      process.env.JWT_SECRET || 'your_super_secret_key',
      { expiresIn: '7d' }
    );

    res.status(200).json({ token, user: { id: user._id, name: user.name, email: user.email, role: user.role, profilePictureUrl: user.profilePictureUrl } });
  } catch (error) {
    res.status(500).json({ message: 'Server error during login.' });
  }
});

module.exports = router;