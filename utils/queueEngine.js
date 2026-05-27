const { Queue, Worker } = require('bullmq');
const { compileMissionBrief } = require('./matchmakingEngine');

// Connect to Redis (Local or Cloud)
const connection = {
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: process.env.REDIS_PORT || 6379,
    password: process.env.REDIS_PASSWORD || undefined
};

// Create the Queue
const matchmakingQueue = new Queue('MatchmakingQueue', { connection });

// Create the Worker to process jobs in the background
const matchmakingWorker = new Worker('MatchmakingQueue', async (job) => {
    const { eventId, userId } = job.data;
    console.log(`[Queue] Processing matchmaking for User ${userId} at Event ${eventId}`);
    await compileMissionBrief(eventId, userId);
}, { connection });

matchmakingWorker.on('completed', job => console.log(`[Queue] Job ${job.id} complete.`));
matchmakingWorker.on('failed', (job, err) => console.error(`[Queue] Job ${job.id} failed:`, err));

module.exports = { matchmakingQueue };