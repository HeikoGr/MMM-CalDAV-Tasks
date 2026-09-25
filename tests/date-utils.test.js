const test = require("node:test");
const assert = require("node:assert/strict");

const { parseIcsDate, formatIcsDate } = require("../lib/date-utils");

test("parseIcsDate reads date-time values as UTC", () => {
  assert.equal(parseIcsDate("20260922T143000Z", "jsDate").toISOString(), "2026-09-22T14:30:00.000Z");
});

test("parseIcsDate reads a date-only value as midnight UTC", () => {
  assert.equal(parseIcsDate("20260922", "jsDate").toISOString(), "2026-09-22T00:00:00.000Z");
});

test("formatIcsDate and parseIcsDate round-trip", () => {
  const value = "20260922T143000Z";
  assert.equal(formatIcsDate(parseIcsDate(value, "jsDate")), value);
});

test("formatIcsDate can drop the time for all-day values", () => {
  assert.equal(formatIcsDate(new Date("2026-09-22T14:30:00Z"), "date"), "20260922");
});

test("parseIcsDate rejects a value that is not a date", () => {
  // A relative VALARM trigger must never reach this function.
  assert.throws(() => parseIcsDate("-PT15M", "jsDate"), /Invalid date/);
});

test("parseIcsDate rejects an unknown return type", () => {
  assert.throws(() => parseIcsDate("20260922", "moment"), /Unknown returnType/);
});
