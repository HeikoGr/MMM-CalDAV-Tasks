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

  const year = parseInt(datePart.substring(0, 4), 10);
  const month = parseInt(datePart.substring(4, 6), 10);
  const day = parseInt(datePart.substring(6, 8), 10);

  let hours = 0;
  let minutes = 0;
  let seconds = 0;

  if (isDateTime && timePart) {
    const time = timePart.replace("Z", "");
    hours = parseInt(time.substring(0, 2), 10);
    minutes = parseInt(time.substring(2, 4), 10);
    seconds = parseInt(time.substring(4, 6), 10);
  }

  // Validation
  if (Number.isNaN(year) || Number.isNaN(month) || Number.isNaN(day)) {
    throw new Error(`Invalid date format: ${dateStr}`);
  }
  if (isDateTime && (Number.isNaN(hours) || Number.isNaN(minutes) || Number.isNaN(seconds))) {
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
  const { year, month, day, hours, minutes, seconds, isDateTime } = parseIcsComponents(dateStr);

  switch (returnType) {
    case "jsDate":
      // The wall-clock digits are read as UTC on purpose, also for a floating or TZID time.
      // formatIcsDate() writes them back as UTC and buildLine() (vtodo-completer.js) cuts the
      // "Z" to the original length, so a TZID series keeps its local time across DST changes.
      // Converting to a real instant here would shift every TZID task by its zone offset.
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
  const formatted = `${isoString.replace(/[-:]/g, "").split(".")[0]}Z`;

  return format === "date" ? formatted.split("T")[0] : formatted;
}

module.exports = {
  parseIcsDate,
  formatIcsDate,
};
