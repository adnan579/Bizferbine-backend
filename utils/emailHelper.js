// utils/emailHelper.js
const nodemailer = require('nodemailer');
const dns = require('dns');

// --- THE RENDER NETWORK FIX ---
// Force Node.js to use IPv4 instead of IPv6 to prevent ENETUNREACH errors on free cloud tiers
dns.setDefaultResultOrder('ipv4first');

// Configure the email transmission engine
// Note: For production, credentials are safely stored in Render Environment Variables
const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 465,
  secure: true, // Use SSL
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_PASS
  }
});

const sendVerificationEmail = async (userEmail, userName, token) => {
  const verificationUrl = `https://beta.setupgram.com/verify-email/${token}`;

  const mailOptions = {
    from: '"BizFerbine Overseer" <no-reply@bizferbine.com>',
    to: userEmail,
    subject: 'Welcome to BizFerbine! Verify your Node.',
    html: `
      <div style="font-family: Arial, sans-serif; max-w: 600px; margin: 0 auto; background-color: #050810; color: #fff; padding: 40px; border-radius: 10px; border: 1px solid #1e293b;">
        <h2 style="color: #06b6d4;">Identity Verification Required</h2>
        <p>Hello ${userName},</p>
        <p>Your registration node has been initialized on the BizFerbine network. To prevent bot activity and secure the ecosystem, you must verify your email address before logging in.</p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${verificationUrl}" style="background-color: #06b6d4; color: #000; padding: 15px 30px; text-decoration: none; font-weight: bold; border-radius: 5px; text-transform: uppercase; letter-spacing: 2px;">Verify Identity</a>
        </div>
        <p style="color: #94a3b8; font-size: 12px;">If you did not request this, please ignore this transmission.</p>
      </div>
    `
  };

  await transporter.sendMail(mailOptions);
};

module.exports = { sendVerificationEmail };