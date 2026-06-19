const mongoSanitize = require('express-mongo-sanitize');
const xss = require('xss'); // Using the modern xss library we installed earlier

// Recursive function to safely clean all strings in a payload
const sanitizeInput = (data) => {
    if (typeof data === 'string') {
        return xss.filterXSS(data);
    }
    if (Array.isArray(data)) {
        return data.map(item => sanitizeInput(item));
    }
    if (data !== null && typeof data === 'object') {
        const cleaned = {};
        for (const key in data) {
            cleaned[key] = sanitizeInput(data[key]);
        }
        return cleaned;
    }
    return data;
};

const sanitizationMiddleware = (req, res, next) => {
    // 1. Bypass Socket.io handshakes entirely
    if (req.url && req.url.includes('/socket.io')) {
        return next();
    }

    try {
        // 2. Sanitize Body (Safe to reassign)
        if (req.body && Object.keys(req.body).length > 0) {
            const noSqlCleaned = mongoSanitize.sanitize(req.body, { replaceWith: '_' });
            req.body = sanitizeInput(noSqlCleaned);
        }

        // 3. Sanitize Params (Safe to reassign)
        if (req.params && Object.keys(req.params).length > 0) {
            const noSqlCleaned = mongoSanitize.sanitize(req.params, { replaceWith: '_' });
            req.params = sanitizeInput(noSqlCleaned);
        }

        // 4. Sanitize Query (CRITICAL FIX)
        // We mutate the properties INSIDE the object rather than overwriting 
        // the req.query object itself. This completely bypasses the Socket.io read-only crash.
        if (req.query && Object.keys(req.query).length > 0) {
            const noSqlCleaned = mongoSanitize.sanitize(req.query, { replaceWith: '_' });
            const xssCleaned = sanitizeInput(noSqlCleaned);

            for (const key in xssCleaned) {
                req.query[key] = xssCleaned[key];
            }
        }

        // Proceed to the actual route (e.g., /auth/login)
        next();
    } catch (error) {
        console.error(`[Sanitizer Error] Failed processing on ${req.url}:`, error);
        next();
    }
};

module.exports = sanitizationMiddleware;