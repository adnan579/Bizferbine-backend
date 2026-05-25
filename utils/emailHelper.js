// utils/emailHelper.js
// Bypassing SMTP entirely by using native HTTP Fetch via Brevo API

const sendVerificationEmail = async (userEmail, userName, token) => {
  const verificationUrl = `https://beta.setupgram.com/verify-email/${token}`;

  const htmlContent = `
    <div style="font-family: Arial, sans-serif; max-w: 600px; margin: 0 auto; background-color: #050810; color: #fff; padding: 40px; border-radius: 10px; border: 1px solid #1e293b;">
      <h2 style="color: #06b6d4;">Identity Verification Required</h2>
      <p>Hello ${userName},</p>
      <p>Your registration node has been initialized on the BizFerbine network. To prevent bot activity and secure the ecosystem, you must verify your email address before logging in.</p>
      <div style="text-align: center; margin: 30px 0;">
        <a href="${verificationUrl}" style="background-color: #06b6d4; color: #000; padding: 15px 30px; text-decoration: none; font-weight: bold; border-radius: 5px; text-transform: uppercase; letter-spacing: 2px;">Verify Identity</a>
      </div>
      <p style="color: #94a3b8; font-size: 12px;">If you did not request this, please ignore this transmission.</p>
    </div>
  `;

  try {
    // Firing the email over standard HTTPS (Port 443) which Render cannot block
    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'accept': 'application/json',
        'api-key': process.env.BREVO_API_KEY,
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        sender: { 
          email: process.env.GMAIL_USER, // The email you verified in Brevo
          name: 'BizFerbine Overseer' 
        },
        to: [{ email: userEmail }],
        subject: 'Welcome to BizFerbine! Verify your Node.',
        htmlContent: htmlContent
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('Brevo API Error:', errorData);
    } else {
      console.log(`🚀 [HTTP Bypass] Verification email successfully fired to ${userEmail}`);
    }
  } catch (error) {
    console.error('Network error while sending email:', error);
  }
};

const sendPasswordResetEmail = async (userEmail, userName, token) => {
  const resetUrl = `https://beta.setupgram.com/reset-password/${token}`;

  const htmlContent = `
    <div style="font-family: Arial, sans-serif; max-w: 600px; margin: 0 auto; background-color: #050810; color: #fff; padding: 40px; border-radius: 10px; border: 1px solid #1e293b;">
      <h2 style="color: #a855f7;">Password Reset Request</h2>
      <p>Hello ${userName},</p>
      <p>We received a request to reset the passphrase for your BizFerbine network node. Click the button below to establish new credentials.</p>
      <div style="text-align: center; margin: 30px 0;">
        <a href="${resetUrl}" style="background-color: #a855f7; color: #fff; padding: 15px 30px; text-decoration: none; font-weight: bold; border-radius: 5px; text-transform: uppercase; letter-spacing: 2px;">Reset Passphrase</a>
      </div>
      <p style="color: #94a3b8; font-size: 12px;">If you did not request this, your node is secure and you can safely ignore this transmission. This link will expire in 1 hour.</p>
    </div>
  `;

  try {
    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'accept': 'application/json',
        'api-key': process.env.BREVO_API_KEY,
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        sender: { email: process.env.GMAIL_USER, name: 'BizFerbine Overseer' },
        to: [{ email: userEmail }],
        subject: 'BizFerbine - System Recovery Link',
        htmlContent: htmlContent
      })
    });

    if (!response.ok) console.error('Brevo API Error:', await response.json());
    else console.log(`🚀 [HTTP Bypass] Password recovery email fired to ${userEmail}`);
  } catch (error) {
    console.error('Network error while sending email:', error);
  }
};

module.exports = { sendVerificationEmail, sendPasswordResetEmail };