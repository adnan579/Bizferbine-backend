const { WellnessLog } = require('../models/CoreSchemas');

const governorMiddleware = async (req, res, next) => {
  try {
    const latestLog = await WellnessLog.findOne({ user: req.user.userId }).sort({ createdAt: -1 });
    if (latestLog) {
      const logDate = new Date(latestLog.createdAt);
      const today = new Date();
      if (logDate.toDateString() === today.toDateString()) {
        const score = Number(latestLog.mood);
        if (!isNaN(score) && score < 40) {
          return res.status(403).json({ message: 'AUTONOMIC LOCKOUT: Your clinical stability score is critical. Deal execution is locked to protect your assets. Please use the Aegis Protocol.' });
        }
      }
    }
    next();
  } catch (error) {
    next(); // Fail open so we don't break the app if wellness DB is slow
  }
};
module.exports = governorMiddleware;
