/**
 * Test helpers for reading properties back out of generated ICS content.
 */

function toLines(ics) {
  return ics.split("\r\n");
}

/**
 * Collect the property lines of one component.
 * @param {string} ics - ICS content.
 * @param {string} component - Component name, e.g. "VTODO".
 * @returns {string[]} The raw lines inside that component.
 */
function componentLines(ics, component) {
  const lines = [];
  const stack = [];

  for (const line of toLines(ics)) {
    if (line.startsWith("BEGIN:")) {
      stack.push(line.slice("BEGIN:".length));
      continue;
    }
    if (line.startsWith("END:")) {
      stack.pop();
      continue;
    }
    // Only the innermost component counts, so a VALARM nested in a VTODO does
    // not contribute its properties to the VTODO.
    if (stack[stack.length - 1] === component) {
      lines.push(line);
    }
  }

  return lines;
}

/**
 * Read a property value from a component.
 * @param {string} ics - ICS content.
 * @param {string} component - Component name, e.g. "VTODO".
 * @param {string} key - Property name.
 * @returns {string|null} The value, or null when the property is absent.
 */
function prop(ics, component, key) {
  for (const line of componentLines(ics, component)) {
    const [keyPart, ...valueParts] = line.split(":");
    if (keyPart.split(";")[0] === key) {
      return valueParts.join(":");
    }
  }
  return null;
}

/**
 * Count how often a property occurs in a component.
 * @param {string} ics - ICS content.
 * @param {string} component - Component name.
 * @param {string} key - Property name.
 * @returns {number} Number of occurrences.
 */
function countProp(ics, component, key) {
  return componentLines(ics, component).filter(
    (line) => line.split(":")[0].split(";")[0] === key,
  ).length;
}

/**
 * Parse an ICS UTC date value into a Date.
 * @param {string} value - e.g. "20260910T100000Z".
 * @returns {Date} The parsed date.
 */
function icsToDate(value) {
  const [date, time = "000000"] = value.replace("Z", "").split("T");
  return new Date(
    Date.UTC(
      Number(date.slice(0, 4)),
      Number(date.slice(4, 6)) - 1,
      Number(date.slice(6, 8)),
      Number(time.slice(0, 2)),
      Number(time.slice(2, 4)),
      Number(time.slice(4, 6)),
    ),
  );
}

module.exports = { componentLines, prop, countProp, icsToDate };
