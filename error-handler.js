/**
 * Custom error class for CalDAV-related errors
 */
class CalDAVError extends Error {
    /**
     * Create a CalDAV error
     * @param {string} message - Error message
     * @param {string} code - Error code (e.g., 'AUTH_FAILED')
     * @param {Object} [details={}] - Additional error details
     */
    constructor(message, code, details = {}) {
        super(message);
        this.name = "CalDAVError";
        this.code = code;
        this.details = details;
    }
}

/**
 * Error code definitions with user-friendly messages
 */
const ERROR_CODES = {
    AUTH_FAILED: {
        message: "WebDAV Authentication Failed",
        userMessage:
            "Unauthorized - Please check your username and password. Use an app password, not your regular password!",
        httpStatus: [401]
    },
    NOT_FOUND: {
        message: "Calendar Not Found",
        userMessage:
            "Calendar URL not found - Check your calendar URL configuration",
        httpStatus: [404]
    },
    NETWORK_ERROR: {
        message: "Network Error",
        userMessage:
            "Cannot reach CalDAV server - Check your network connection and server URL",
        httpStatus: [0, 500, 502, 503, 504]
    },
    PARSE_ERROR: {
        message: "ICS Parse Error",
        userMessage:
            "Invalid calendar data received from server - The ICS format may be corrupted"
    },
    CONFIG_ERROR: {
        message: "Configuration Error",
        userMessage: "Invalid module configuration - Check your config.js"
    },
    RATE_LIMIT: {
        message: "Rate Limit Exceeded",
        userMessage: "Too many requests to server - Increase your updateInterval",
        httpStatus: [429]
    },
    UNKNOWN: {
        message: "Unknown Error",
        userMessage:
            "An unexpected error occurred - Check the console logs for details"
    }
};

/**
 * Map HTTP error to CalDAVError
 * @param {Error} error - Original error object
 * @returns {CalDAVError} Mapped CalDAV error
 *
 * @example
 * try {
 *   await fetchData();
 * } catch (error) {
 *   const caldavError = fromHttpError(error);
 *   console.log(caldavError.code); // 'AUTH_FAILED'
 * }
 */
function fromHttpError(error) {
    const status = error.status || error.response?.status || 0;

    // Find matching error code by HTTP status
    for (const [code, info] of Object.entries(ERROR_CODES)) {
        if (info.httpStatus?.includes(status)) {
            return new CalDAVError(info.message, code, {
                originalError: error,
                httpStatus: status
            });
        }
    }

    // Check for specific error types
    if (error.name === "SyntaxError" || error.message?.includes("parse")) {
        return new CalDAVError(ERROR_CODES.PARSE_ERROR.message, "PARSE_ERROR", {
            originalError: error
        });
    }

    if (error.code === "ENOTFOUND" || error.code === "ETIMEDOUT") {
        return new CalDAVError(ERROR_CODES.NETWORK_ERROR.message, "NETWORK_ERROR", {
            originalError: error,
            errorCode: error.code
        });
    }

    // Unknown error
    return new CalDAVError("Unknown Error", "UNKNOWN", {
        originalError: error
    });
}

/**
 * Handle error and send to frontend
 * @param {Error|CalDAVError} error - Error to handle
 * @param {string} moduleId - Module identifier
 * @param {Function} sendErrorFn - Function to send error to frontend
 *
 * @example
 * try {
 *   await getData();
 * } catch (error) {
 *   handleError(error, moduleId, this.sendError.bind(this));
 * }
 */
function handleError(error, moduleId, sendErrorFn) {
    const caldavError =
        error instanceof CalDAVError ? error : fromHttpError(error);

    // Log to console with full details
    console.error(`[MMM-CalDAV-Tasks] ${caldavError.code}:`, caldavError.message);

    if (caldavError.details.originalError) {
        console.error(
            "[MMM-CalDAV-Tasks] Original error:",
            caldavError.details.originalError
        );
    }

    // Send user-friendly message to frontend
    const userMessage =
        ERROR_CODES[caldavError.code]?.userMessage || caldavError.message;
    sendErrorFn(moduleId, `[MMM-CalDAV-Tasks] ${userMessage}`);
}

/**
 * Create a CalDAVError from a validation error
 * @param {Array<Object>} validationErrors - Validation errors from config-validator
 * @returns {CalDAVError} Configuration error
 */
function fromValidationErrors(validationErrors) {
    const errorMessages = validationErrors.map((e) => e.message).join("; ");

    return new CalDAVError(ERROR_CODES.CONFIG_ERROR.message, "CONFIG_ERROR", {
        validationErrors,
        message: errorMessages
    });
}

module.exports = {
    CalDAVError,
    ERROR_CODES,
    fromHttpError,
    handleError,
    fromValidationErrors
};
