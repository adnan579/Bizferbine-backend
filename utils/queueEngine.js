const { Queue, Worker } = require('bullmq');
const { compileMissionBrief } = require('./matchmakingEngine');
const IORedis = require('ioredis');

// 1. Establish Resilient Redis Connection
const redisConnection = new IORedis(process.env.REDIS_URL || 'redis://127.0.0.1:6379', {
    maxRetriesPerRequest: null, // Required strictly by BullMQ
    retryStrategy(times) {
        const delay = Math.min(times * 50, 2000);
        return delay; // Backoff strategy to prevent log spamming if DB drops
    }
});

redisConnection.on('error', (err) => {
    console.error('🚨 [Redis Hardware Fault]:', err.message);
});

// 2. Initialize Queue
const matchmakingQueue = new Queue('MatchmakingQueue', { connection: redisConnection });

// 3. Initialize Worker
const matchmakingWorker = new Worker('MatchmakingQueue', async (job) => {
    const { eventId, userId } = job.data;
    console.log(`⚙️ [Queue Engine] Compiling Relationship Intelligence for Node ${userId} at Event ${eventId}`);
    await compileMissionBrief(eventId, userId);
}, { connection: redisConnection });

matchmakingWorker.on('completed', job => console.log(`✅ [Queue Engine] Job ${job.id} executed flawlessly.`));
matchmakingWorker.on('failed', (job, err) => console.error(`❌ [Queue Engine] Job ${job.id} failed:`, err));

module.exports = { matchmakingQueue, redisConnection };