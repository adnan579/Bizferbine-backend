const { fileTypeFromStream } = require('file-type');

/**
 * A multer fileFilter function that validates a file's true MIME type using its magic numbers.
 * @param {string[]} allowedMimeTypes - An array of allowed MIME types (e.g., ['image/jpeg', 'application/pdf']).
 */
const createMagicNumberValidator = (allowedMimeTypes) => {
    return async (req, file, cb) => {
        try {
            // Dynamically import the ESM-only file-type package
            const { fileTypeFromStream } = await import('file-type');
            // file.stream is a readable stream of the file content
            const fileType = await fileTypeFromStream(file.stream);

            if (!fileType) {
                // If file-type can't determine the type, reject it.
                const error = new Error('File type could not be determined or is not supported.');
                error.code = 'INVALID_FILE_TYPE';
                return cb(error, false);
            }

            if (allowedMimeTypes.includes(fileType.mime)) {
                // The file's magic number matches an allowed type. Accept the file.
                cb(null, true);
            } else {
                // The file's magic number does not match any allowed types. Reject it.
                const error = new Error(`File type mismatch: extension is .${file.originalname.split('.').pop()}, but content is ${fileType.mime}.`);
                error.code = 'MIME_TYPE_MISMATCH';
                cb(error, false);
            }
        } catch (err) {
            cb(err, false);
        }
    };
};

module.exports = { createMagicNumberValidator };