// utils/analyticsHelper.js
const { AnalyticsEvent } = require('../models/CoreSchemas');

/**
 * Silently logs user behavior for the Analytics Engine.
 * This function does NOT use 'await' when saving to prevent blocking API responses.
 */
const trackEvent = ({ actor, targetUser, eventType, metadata = {} }) => {
  try {
    // 1. Prevent Self-Tracking: If a user clicks their own profile or links, ignore it.
    // We only want genuine validation from other nodes.
    if (actor && targetUser && actor.toString() === targetUser.toString()) {
      return; 
    }

    const newEvent = new AnalyticsEvent({
      actor,
      targetUser,
      eventType,
      metadata
    });

    // 2. Fire and Forget: We use .catch() instead of await so the user's API call finishes instantly
    newEvent.save().catch(err => console.error('Silent Analytics Tracking Error:', err));
    
  } catch (error) {
    console.error('Analytics Helper Error:', error);
  }
};

module.exports = { trackEvent };