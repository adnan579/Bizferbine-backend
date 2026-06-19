const mongoSanitize = require('express-mongo-sanitize');

// 1. NATIVE ZERO-DEPENDENCY XSS ESCAPER
// No NPM packages required. This will never cause a MODULE_NOT_FOUND error.
const escapeHTML = (str) => {
    if (typeof str !== 'string') return str;
    return str.replace(/[&<>'"]/g, tag => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        "'": '&#39;',
        '"': '&quot;'
    }[tag]));
};

// Recursive function to safely clean all strings deeply nested in a payload
const sanitizeInput = (data) => {
    if (typeof data === 'string') {
        return escapeHTML(data);
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
    // 2. Bypass Socket.io handshakes entirely to prevent WebSocket crashes
    if (req.url && req.url.includes('/socket.io')) {
        return next();
    }

    try {
        // 3. Sanitize Body (Safe to reassign)
        if (req.body && Object.keys(req.body).length > 0) {
            const noSqlCleaned = mongoSanitize.sanitize(req.body, { replaceWith: '_' });
            req.body = sanitizeInput(noSqlCleaned);
        }

        // 4. Sanitize Params (Safe to reassign)
        if (req.params && Object.keys(req.params).length > 0) {
            const noSqlCleaned = mongoSanitize.sanitize(req.params, { replaceWith: '_' });
            req.params = sanitizeInput(noSqlCleaned);
        }

        // 5. Sanitize Query (CRITICAL FIX FOR LOGIN & SOCKETS)
        if (req.query && Object.keys(req.query).length > 0) {
            const noSqlCleaned = mongoSanitize.sanitize(req.query, { replaceWith: '_' });
            const xssCleaned = sanitizeInput(noSqlCleaned);

            for (const key in xssCleaned) {
                req.query[key] = xssCleaned[key];
            }
        }

        next();
    } catch (error) {
        console.error(`[Sanitizer Error] Failed processing on ${req.url}:`, error);
        next(); // Ensures the server NEVER crashes, even if an error occurs
    }
};

module.exports = sanitizationMiddleware;