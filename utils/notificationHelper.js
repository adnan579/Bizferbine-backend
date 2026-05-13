// utils/notificationHelper.js
const { Notification } = require('../models/CoreSchemas');

/**
 * A reusable function to fire notifications from anywhere in the app.
 */
const sendNotification = async ({ recipient, sender, type, message, targetId }) => {
  try {
    // Security check: Never send a notification to yourself!
    if (recipient.toString() === sender.toString()) {
        return; 
    }

    const alert = new Notification({
      recipient,
      sender,
      type,
      message,
      targetId
    });

    await alert.save();
    
    // This will print in our terminal so we know it worked behind the scenes
    console.log(`🔔 [Alert System] ${type} notification sent to User ${recipient}`);
    
    return alert;
  } catch (error) {
    console.error('❌ [Alert System Error]: Failed to send notification', error);
  }
};

module.exports = { sendNotification };