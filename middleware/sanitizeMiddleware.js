const mongoSanitize = require('express-mongo-sanitize');

// 1. NATIVE ZERO-DEPENDENCY XSS ESCAPER
// This completely removes the need for 'xss' or 'xss-clean' NPM packages.
// It safely converts malicious tags (like <script>) into harmless text strings.
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
        // We mutate the properties INSIDE the object rather than overwriting 
        // the req.query object itself. This bypasses the strict read-only lock.
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