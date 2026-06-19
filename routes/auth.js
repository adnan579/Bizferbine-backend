// routes/auth.js
const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const crypto = require('crypto'); // Built into Node.js
const rateLimit = require('express-rate-limit');
const { User } = require('../models/CoreSchemas');
const { sendVerificationEmail, sendPasswordResetEmail } = require('../utils/emailHelper');
const { OAuth2Client } = require('google-auth-library');

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { message: "Too many login attempts from this IP, please try again after 15 minutes." }
});

const router = express.Router();

// --- ROUTE 1: REGISTER WITH VERIFICATION ---
router.post('/register', async (req, res) => {
  try {
    const { name, email, password, role, timezone, currency, termsAccepted, privacyAccepted, policyVersion } = req.body;

    if (termsAccepted !== true || privacyAccepted !== true) {
      return res.status(400).json({ message: 'You must explicitly accept the terms of service and privacy policy to register.' });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) return res.status(400).json({ message: 'User already exists.' });

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    // --- ADD THIS SAFETY NET ---
    const validRoles = ['business_owner', 'entrepreneur', 'professional', 'mentor'];
    const assignedRole = validRoles.includes(role) ? role : 'professional';

    // Generate a secure random token for email verification (DECLARED ONLY ONCE NOW!)
    const verificationToken = crypto.randomBytes(32).toString('hex');

    const newUser = new User({
      name,
      email,
      passwordHash,
      role: assignedRole, // Uses our safety net!
      timezone,
      currency: currency || 'USD',
      legalCompliance: {
        termsAccepted,
        privacyAccepted,
        consentTimestamp: new Date(),
        policyVersion: policyVersion || '1.0'
      },
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
router.post('/login', loginLimiter, async (req, res) => {
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

    res.cookie('bizzua_token', token, { httpOnly: true, secure: true, sameSite: 'none', maxAge: 7 * 24 * 60 * 60 * 1000 });
    res.status(200).json({ user: { id: user._id, name: user.name, email: user.email, role: user.role, profilePictureUrl: user.profilePictureUrl } });
  } catch (error) {
    res.status(500).json({ message: 'Server error during login.' });
  }
});

// --- ROUTE 4: FORGOT PASSWORD (RECOVERY ENGINE) ---
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email });

    if (!user) return res.status(404).json({ message: 'User not found.' });

    const token = crypto.randomBytes(20).toString('hex');
    user.resetPasswordToken = token;
    user.resetPasswordExpires = Date.now() + 3600000; // 1 hour from now

    await user.save();

    try {
      await sendPasswordResetEmail(user.email, user.name, token);
    } catch (emailErr) {
      console.error("Email dispatch failed:", emailErr);
    }

    res.status(200).json({ message: 'Password recovery initiated. Check your email.' });
  } catch (error) {
    res.status(500).json({ message: 'Server error during password recovery.' });
  }
});

// --- ROUTE 5: RESET PASSWORD (RECOVERY ENGINE) ---
router.post('/reset-password/:token', async (req, res) => {
  try {
    const { password } = req.body;
    const user = await User.findOne({
      resetPasswordToken: req.params.token,
      resetPasswordExpires: { $gt: Date.now() }
    });

    if (!user) return res.status(400).json({ message: 'Invalid or expired reset token.' });

    const salt = await bcrypt.genSalt(10);
    user.passwordHash = await bcrypt.hash(password, salt);
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;

    await user.save();
    res.status(200).json({ message: 'Password has been successfully reset. You may now log in.' });
  } catch (error) {
    res.status(500).json({ message: 'Server error during password reset.' });
  }
});

// --- ROUTE 6: GOOGLE OAUTH LOGIN / AUTO-REGISTER ---
router.post('/google', async (req, res) => {
  try {
    const { credential } = req.body;

    // 1. Verify the Google Token
    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID
    });
    const payload = ticket.getPayload();
    const { email, name, picture } = payload;

    // 2. Check if a User exists in our DB
    let user = await User.findOne({ email });

    if (user) {
      if (user.status === 'Suspended') {
        return res.status(403).json({ message: 'ACCOUNT SUSPENDED: Your access has been revoked by Overseer Admins.' });
      }
    } else {
      // 3. Auto-Register new User
      const randomPassword = crypto.randomBytes(16).toString('hex');
      const salt = await bcrypt.genSalt(10);
      const passwordHash = await bcrypt.hash(randomPassword, salt);

      user = new User({
        name,
        email,
        passwordHash,
        role: 'professional',
        profilePictureUrl: picture,
        isVerified: true // Google already verified their identity
      });
      await user.save();
    }

    // 4. Generate Session Token and Authenticate
    const token = jwt.sign({ userId: user._id, role: user.role }, process.env.JWT_SECRET || 'your_super_secret_key', { expiresIn: '7d' });
    res.cookie('bizzua_token', token, { httpOnly: true, secure: true, sameSite: 'none', maxAge: 7 * 24 * 60 * 60 * 1000 });
    res.status(200).json({ user: { id: user._id, name: user.name, email: user.email, role: user.role, profilePictureUrl: user.profilePictureUrl } });
  } catch (error) {
    console.error('Google OAuth Error:', error);
    res.status(500).json({ message: 'Server error during Google authentication.' });
  }
});

// --- ROUTE 7: SECURE LOGOUT ---
router.post('/logout', (req, res) => {
  res.clearCookie('bizzua_token');
  res.status(200).json({ message: 'Node disconnected successfully.' });
});

module.exports = router;