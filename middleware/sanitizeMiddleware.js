const mongoSanitize = require('express-mongo-sanitize');
const xss = require('xss-clean');

// Initialize the middleware functions
const sanitizeMongo = mongoSanitize();
const sanitizeXss = xss();

const sanitizationMiddleware = (req, res, next) => {
    // 1. BYPASS WEBSOCKETS: If this is a Socket.io request, skip sanitization entirely
    if (req.url && req.url.includes('/socket.io')) {
        return next();
    }

    // 2. CRASH PREVENTION: Wrap in try/catch to stop the "IncomingMessage getter" TypeError
    try {
        sanitizeMongo(req, res, (err) => {
            if (err) return next(err);

            // Proceed to XSS clean if Mongo sanitize passes
            sanitizeXss(req, res, next);
        });
    } catch (error) {
        // If a read-only object slips through, log it safely instead of crashing the server
        console.warn(`⚠️ [Sanitizer] Bypassed read-only object on route: ${req.url}`);
        next();
    }
};

// Export as a single bulletproof function instead of an array
module.exports = sanitizationMiddleware;