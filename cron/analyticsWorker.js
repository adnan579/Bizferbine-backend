// cron/analyticsWorker.js
const cron = require('node-cron');
const { AnalyticsEvent, AnalyticsSummary, User } = require('../models/CoreSchemas');

console.log("CRON: Analytics Aggregator Initialized. Standing by.");

// This runs at 00:00 (Midnight) every single day
// (Note: To test this immediately, you can change '0 0 * * *' to '* * * * *' to run every minute)
cron.schedule('0 0 * * *', async () => {
  console.log("CRON: Waking up to aggregate daily analytics...");
  try {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    // 1. Get all users who had ANY activity in the last 7 days
    const activeUsers = await AnalyticsEvent.distinct('targetUser', {
        createdAt: { $gte: sevenDaysAgo }
    });

    for (let userId of activeUsers) {
      // 2. Tally up the exact events for this specific user
      const weeklyEvents = await AnalyticsEvent.find({
        targetUser: userId,
        createdAt: { $gte: sevenDaysAgo }
      });

      let weeklyViews = 0;
      let projectClicks = 0;
      let mentorInterest = 0;

      weeklyEvents.forEach(event => {
        if (event.eventType === 'PROFILE_VIEW') weeklyViews++;
        if (['PORTFOLIO_CLICK', 'GITHUB_CLICK', 'WEBSITE_CLICK', 'LINKEDIN_CLICK'].includes(event.eventType)) projectClicks++;
        if (event.eventType === 'MENTORSHIP_REQUEST') mentorInterest++;
      });

      // 3. Update or Create their Summary Document
      await AnalyticsSummary.findOneAndUpdate(
        { user: userId },
        { 
          weeklyProfileViews: weeklyViews,
          projectClicks: projectClicks,
          mentorshipRequests: mentorInterest,
          calculatedAt: new Date()
        },
        { upsert: true, new: true }
      );
    }
    console.log(`CRON: Successfully updated analytics for ${activeUsers.length} active nodes.`);
  } catch (error) {
    console.error("CRON ERROR:", error);
  }
});