const mongoSanitize = require('express-mongo-sanitize');
const xss = require('xss-clean');

// An array of sanitization middleware to be applied globally.
const sanitizationMiddleware = [
    // Prevent NoSQL injection by removing '$' and '.' characters from req.body, req.query, and req.params.
    mongoSanitize(),
    // Sanitize user input from req.body, req.query, and req.params to prevent XSS attacks.
    xss(),
];

module.exports = sanitizationMiddleware;