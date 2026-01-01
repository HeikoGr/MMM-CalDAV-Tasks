const { datetime } = require("rrule");

/**
 * Parse ICS date string components
 * @private
 * @param {string} dateStr - Date in YYYYMMDD or YYYYMMDDTHHMMSSz format
 * @returns {Object} Parsed date components
 * @throws {Error} If date format is invalid
 */
function parseIcsComponents(dateStr) {
    const isDateTime = dateStr.includes("T");
    const [datePart, timePart = ""] = dateStr.split("T");

    const year = parseInt(datePart.substring(0, 4));
    const month = parseInt(datePart.substring(4, 6));
    const day = parseInt(datePart.substring(6, 8));

    let hours = 0;
    let minutes = 0;
    let seconds = 0;

    if (isDateTime && timePart) {
        const time = timePart.replace("Z", "");
        hours = parseInt(time.substring(0, 2));
        minutes = parseInt(time.substring(2, 4));
        seconds = parseInt(time.substring(4, 6));
    }

    // Validation
    if (isNaN(year) || isNaN(month) || isNaN(day)) {
        throw new Error(`Invalid date format: ${dateStr}`);
    }
    if (isDateTime && (isNaN(hours) || isNaN(minutes) || isNaN(seconds))) {
        throw new Error(`Invalid datetime format: ${dateStr}`);
    }

    return { year, month, day, hours, minutes, seconds, isDateTime };
}

/**
 * Parse ICS date string to various formats
 * @param {string} dateStr - Date in YYYYMMDD or YYYYMMDDTHHMMSSz format
 * @param {string} returnType - 'jsDate' | 'rruleDatetime'
 * @returns {Date|datetime} Parsed date object
 * @throws {Error} If date format is invalid or returnType is unknown
 *
 * @example
 * // Parse to JavaScript Date
 * parseIcsDate('20240101T120000Z', 'jsDate')
 * // => Date object
 *
 * @example
 * // Parse to RRule datetime
 * parseIcsDate('20240101T120000Z', 'rruleDatetime')
 * // => RRule datetime object
 */
function parseIcsDate(dateStr, returnType = "jsDate") {
    const { year, month, day, hours, minutes, seconds, isDateTime } =
        parseIcsComponents(dateStr);

    switch (returnType) {
        case "jsDate":
            // JavaScript Date (month is 0-indexed)
            return new Date(Date.UTC(year, month - 1, day, hours, minutes, seconds));

        case "rruleDatetime":
            // RRule datetime (month is 1-indexed)
            if (isDateTime) {
                return new datetime(year, month, day, hours, minutes, seconds);
            }
            return new datetime(year, month, day);

        default:
            throw new Error(`Unknown returnType: ${returnType}`);
    }
}

/**
 * Format JavaScript Date to ICS format
 * @param {Date} date - JavaScript Date object
 * @param {string} format - 'date' | 'datetime'
 * @returns {string} ICS formatted date string (YYYYMMDD or YYYYMMDDTHHMMSSz)
 *
 * @example
 * formatIcsDate(new Date('2024-01-01T12:00:00Z'), 'datetime')
 * // => '20240101T120000Z'
 *
 * @example
 * formatIcsDate(new Date('2024-01-01'), 'date')
 * // => '20240101'
 */
function formatIcsDate(date, format = "datetime") {
    const isoString = date.toISOString();
    const formatted = isoString.replace(/[-:]/g, "").split(".")[0] + "Z";

    return format === "date" ? formatted.split("T")[0] : formatted;
}

/**
 * Calculate days between two dates
 * @param {Date|string} date1 - First date
 * @param {Date|string} date2 - Second date
 * @returns {number} Absolute number of days between dates
 *
 * @example
 * daysBetween('2024-01-01', '2024-01-10')
 * // => 9
 */
function daysBetween(date1, date2) {
    const ms = Math.abs(new Date(date2) - new Date(date1));
    return Math.floor(ms / (1000 * 60 * 60 * 24));
}

/**
 * Check if a date is overdue (in the past)
 * @param {Date|string} dueDate - Date to check
 * @returns {boolean} True if date is in the past
 *
 * @example
 * isOverdue('2020-01-01')
 * // => true
 */
function isOverdue(dueDate) {
    return new Date() > new Date(dueDate);
}

/**
 * Check if a date has started (is in the past or today)
 * @param {Date|string} startDate - Date to check
 * @returns {boolean} True if date has started
 *
 * @example
 * hasStarted('2020-01-01')
 * // => true
 */
function hasStarted(startDate) {
    return new Date() >= new Date(startDate);
}

module.exports = {
    parseIcsDate,
    formatIcsDate,
    daysBetween,
    isOverdue,
    hasStarted
};
