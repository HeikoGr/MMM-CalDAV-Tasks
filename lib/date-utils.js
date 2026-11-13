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

  return { year, month, day, hours, minutes, seconds };
}

/**
 * Parse an ICS date string into a Date. Also what rrule works with: its datetime() is the
 * same Date.UTC construction.
 * @param {string} dateStr - Date in YYYYMMDD or YYYYMMDDTHHMMSSz format
 * @returns {Date} Parsed date
 * @throws {Error} If the date format is invalid
 *
 * @example
 * parseIcsDate('20240101T120000Z') // => 2024-01-01T12:00:00.000Z
 */
function parseIcsDate(dateStr) {
  const { year, month, day, hours, minutes, seconds } = parseIcsComponents(dateStr);
  // The wall-clock digits are read as UTC on purpose, also for a floating or TZID time.
  // formatIcsDate() writes them back as UTC and buildLine() (vtodo-completer.js) cuts the
  // "Z" to the original length, so a TZID series keeps its local time across DST changes.
  // Converting to a real instant here would shift every TZID task by its zone offset.
  return new Date(Date.UTC(year, month - 1, day, hours, minutes, seconds));
}

/**
 * Format a Date as an ICS UTC date-time. buildLine() (vtodo-completer.js) shortens it to the
 * form the property had before (date only, floating).
 * @param {Date} date - JavaScript Date object
 * @returns {string} e.g. '20240101T120000Z'
 */
function formatIcsDate(date) {
  return `${date.toISOString().replace(/[-:]/g, "").split(".")[0]}Z`;
}

module.exports = {
  parseIcsDate,
  formatIcsDate,
};
