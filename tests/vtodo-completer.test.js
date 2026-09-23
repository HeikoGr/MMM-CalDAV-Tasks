const test = require("node:test");
const assert = require("node:assert/strict");

const VTodoCompleter = require("../lib/vtodo-completer.js");
const { prop, countProp, icsToDate } = require("./helpers/ics.js");

const CALENDAR_URL = "https://dav.example/calendars/user/tasks/";
const UID = "AAAA-1111-BBBB";
const FILENAME = `${CALENDAR_URL}${UID}.ics`;

/**
 * Build an ICS fixture with real CRLF line endings.
 * @param {Object} [options] - Fixture options.
 * @returns {string} ICS content.
 */
function buildIcs({ rrule = null, alarm = null, extra = [] } = {}) {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Test//Tasks//EN",
    "BEGIN:VTODO",
    "CREATED:20200101T090000Z",
    "DTSTAMP:20200101T090000Z",
    "LAST-MODIFIED:20200101T090000Z",
    `UID:${UID}`,
    "SUMMARY:Take out the trash",
    "DTSTART:20200105T080000Z",
    "DUE:20200105T100000Z",
    "STATUS:NEEDS-ACTION",
  ];

  if (rrule) {
    lines.push(`RRULE:${rrule}`);
  }
  lines.push(...extra);

  if (alarm) {
    lines.push("BEGIN:VALARM", "ACTION:DISPLAY", ...alarm, "END:VALARM");
  }

  lines.push("END:VTODO", "END:VCALENDAR", "");
  return lines.join("\r\n");
}

/**
 * Create a completer whose reads and writes are captured in memory.
 * @param {string} ics - The ICS content the server would return.
 * @returns {{completer: Object, puts: Array}} Completer and recorded writes.
 */
function makeCompleter(ics) {
  const puts = [];
  const completer = new VTodoCompleter({
    getFileContents: async () => ({ data: ics }),
    putFileContents: async (_config, filename, data, options) => {
      puts.push({ filename, data, options });
      return { ok: true };
    },
  });
  return { completer, puts };
}

const startOfToday = new Date(new Date().setHours(0, 0, 0, 0));

test("completing a non-recurring task marks it done in place", async () => {
  const { completer, puts } = makeCompleter(buildIcs());
  const completedDate = new Date("2026-09-22T12:00:00Z");

  const result = await completer.completeVTodo({}, FILENAME, completedDate);

  assert.deepEqual(result, { original: FILENAME });
  assert.equal(puts.length, 1);
  assert.equal(puts[0].filename, FILENAME);
  assert.equal(prop(puts[0].data, "VTODO", "STATUS"), "COMPLETED");
  assert.equal(prop(puts[0].data, "VTODO", "COMPLETED"), "20260922T120000Z");
  assert.equal(prop(puts[0].data, "VTODO", "PERCENT-COMPLETE"), "100");
  // The due date of a one-off task stays where it was.
  assert.equal(prop(puts[0].data, "VTODO", "DUE"), "20200105T100000Z");
});

test("completing a recurring task records the occurrence and moves the series", async () => {
  const { completer, puts } = makeCompleter(buildIcs({ rrule: "FREQ=DAILY" }));
  const completedDate = new Date("2026-09-22T12:00:00Z");

  const result = await completer.completeVTodo({}, FILENAME, completedDate);

  assert.equal(puts.length, 2, "one write for the occurrence, one for the series");

  const [occurrence, series] = puts;

  // The completed occurrence is a new object and must not overwrite the series.
  assert.notEqual(occurrence.filename, FILENAME);
  assert.equal(occurrence.filename, result.new);
  assert.equal(occurrence.options?.create, true);
  assert.equal(prop(occurrence.data, "VTODO", "STATUS"), "COMPLETED");
  assert.equal(prop(occurrence.data, "VTODO", "COMPLETED"), "20260922T120000Z");
  assert.equal(prop(occurrence.data, "VTODO", "PERCENT-COMPLETE"), "100");
  // It carries the dates of the occurrence that was just done ...
  assert.equal(prop(occurrence.data, "VTODO", "DUE"), "20200105T100000Z");
  // ... and does not recur again.
  assert.equal(prop(occurrence.data, "VTODO", "RRULE"), null);
  assert.notEqual(prop(occurrence.data, "VTODO", "UID"), UID);

  // The series keeps its identity and its rule, and is open again.
  assert.equal(series.filename, FILENAME);
  assert.equal(prop(series.data, "VTODO", "UID"), UID);
  assert.equal(prop(series.data, "VTODO", "RRULE"), "FREQ=DAILY");
  assert.equal(prop(series.data, "VTODO", "STATUS"), "NEEDS-ACTION");
  assert.equal(prop(series.data, "VTODO", "COMPLETED"), null);
  assert.equal(prop(series.data, "VTODO", "PERCENT-COMPLETE"), null);

  const newDue = icsToDate(prop(series.data, "VTODO", "DUE"));
  assert.ok(newDue >= startOfToday, `next due ${newDue.toISOString()} must not be in the past`);
  // The fixture runs from 08:00 to 10:00; that window has to survive the move.
  const newStart = icsToDate(prop(series.data, "VTODO", "DTSTART"));
  assert.equal(newDue.getTime() - newStart.getTime(), 2 * 60 * 60 * 1000);
});

test("a series without DTSTART does not get one invented", async () => {
  const withoutStart = buildIcs({ rrule: "FREQ=DAILY" }).replace("DTSTART:20200105T080000Z\r\n", "");
  const { completer, puts } = makeCompleter(withoutStart);

  await completer.completeVTodo({}, FILENAME, new Date("2026-09-22T12:00:00Z"));

  const series = puts[1];
  assert.equal(prop(series.data, "VTODO", "DTSTART"), null);
  assert.ok(icsToDate(prop(series.data, "VTODO", "DUE")) >= startOfToday);
});

test("an exhausted RRULE completes the last occurrence instead of jumping to 1970", async () => {
  // Three daily occurrences from 2020 - all of them are long past.
  const { completer, puts } = makeCompleter(buildIcs({ rrule: "FREQ=DAILY;COUNT=3" }));
  const completedDate = new Date("2026-09-22T12:00:00Z");

  const result = await completer.completeVTodo({}, FILENAME, completedDate);

  assert.equal(puts.length, 1, "the series ends here, no new occurrence");
  assert.equal(puts[0].filename, FILENAME);
  assert.equal(result.new, null);
  assert.equal(prop(puts[0].data, "VTODO", "STATUS"), "COMPLETED");
  assert.equal(prop(puts[0].data, "VTODO", "DUE"), "20200105T100000Z");
  assert.ok(!puts[0].data.includes("19700101"), "must not write the epoch as a due date");
});

test("an UNTIL rule that has run out also completes in place", async () => {
  const { completer, puts } = makeCompleter(buildIcs({ rrule: "FREQ=WEEKLY;UNTIL=20200201T100000Z" }));

  await completer.completeVTodo({}, FILENAME, new Date("2026-09-22T12:00:00Z"));

  assert.equal(puts.length, 1);
  assert.equal(prop(puts[0].data, "VTODO", "STATUS"), "COMPLETED");
  assert.ok(!puts[0].data.includes("19700101"));
});

test("a relative VALARM trigger survives completion untouched", async () => {
  const { completer, puts } = makeCompleter(buildIcs({ rrule: "FREQ=DAILY", alarm: ["TRIGGER:-PT15M"] }));

  // Parsing "-PT15M" as a date used to throw and abort the whole completion.
  await completer.completeVTodo({}, FILENAME, new Date("2026-09-22T12:00:00Z"));

  const series = puts[1];
  assert.equal(prop(series.data, "VALARM", "TRIGGER"), "-PT15M");
});

test("an absolute VALARM trigger keeps its distance to the due date", async () => {
  const { completer, puts } = makeCompleter(
    buildIcs({
      rrule: "FREQ=DAILY",
      // 30 minutes before the 10:00 due date.
      alarm: ["TRIGGER;VALUE=DATE-TIME:20200105T093000Z"],
    }),
  );

  await completer.completeVTodo({}, FILENAME, new Date("2026-09-22T12:00:00Z"));

  const series = puts[1];
  const due = icsToDate(prop(series.data, "VTODO", "DUE"));
  const trigger = icsToDate(prop(series.data, "VALARM", "TRIGGER"));

  assert.equal(due.getTime() - trigger.getTime(), 30 * 60 * 1000);
});

test("a VALARM without UID does not add a second UID to the task", async () => {
  const { completer, puts } = makeCompleter(
    buildIcs({
      rrule: "FREQ=DAILY",
      alarm: ["TRIGGER;VALUE=DATE-TIME:20200105T093000Z"],
    }),
  );

  await completer.completeVTodo({}, FILENAME, new Date("2026-09-22T12:00:00Z"));

  const series = puts[1];
  assert.equal(countProp(series.data, "VTODO", "UID"), 1);
  assert.equal(prop(series.data, "VTODO", "UID"), UID);
  assert.equal(countProp(series.data, "VALARM", "UID"), 1);
});

test("the completed occurrence drops the alarm of the series", async () => {
  const { completer, puts } = makeCompleter(buildIcs({ rrule: "FREQ=DAILY", alarm: ["TRIGGER:-PT15M"] }));

  await completer.completeVTodo({}, FILENAME, new Date("2026-09-22T12:00:00Z"));

  assert.ok(!puts[0].data.includes("VALARM"));
  assert.ok(puts[1].data.includes("BEGIN:VALARM"));
});

test("an object URL that does not contain the UID gets a sibling URL", async () => {
  const opaqueName = `${CALENDAR_URL}object-42.ics`;
  const { completer, puts } = makeCompleter(buildIcs({ rrule: "FREQ=DAILY" }));

  await completer.completeVTodo({}, opaqueName, new Date("2026-09-22T12:00:00Z"));

  assert.notEqual(puts[0].filename, opaqueName, "must not overwrite the series");
  assert.ok(puts[0].filename.startsWith(CALENDAR_URL));
  assert.ok(puts[0].filename.endsWith(".ics"));
  assert.equal(puts[1].filename, opaqueName);
});

test("uncompleteVTodo reopens a completed task", async () => {
  const { completer, puts } = makeCompleter(
    buildIcs({
      extra: ["COMPLETED:20260920T080000Z", "PERCENT-COMPLETE:100"],
    }),
  );

  const result = await completer.uncompleteVTodo({}, FILENAME);

  assert.deepEqual(result, { original: FILENAME });
  assert.equal(puts.length, 1);
  assert.equal(puts[0].filename, FILENAME);
  assert.equal(prop(puts[0].data, "VTODO", "STATUS"), "NEEDS-ACTION");
  assert.equal(prop(puts[0].data, "VTODO", "COMPLETED"), null);
  assert.equal(prop(puts[0].data, "VTODO", "PERCENT-COMPLETE"), null);
});

test("uncompleting a task that never had COMPLETED still opens it", async () => {
  const { completer, puts } = makeCompleter(buildIcs({ extra: ["STATUS:COMPLETED"] }));

  await completer.uncompleteVTodo({}, FILENAME);

  assert.equal(prop(puts[0].data, "VTODO", "STATUS"), "NEEDS-ACTION");
});

test("parse and generate round-trip leaves untouched content byte-identical", () => {
  const ics = buildIcs({ rrule: "FREQ=DAILY", alarm: ["TRIGGER:-PT15M"] });
  const completer = new VTodoCompleter({});

  assert.equal(completer.generateICS(completer.parseICS(ics)), ics);
});

test("an all-day task keeps its date-only due value", async () => {
  const ics = buildIcs()
    .replace("DUE:20200105T100000Z", "DUE;VALUE=DATE:20200105")
    .replace("DTSTART:20200105T080000Z", "DTSTART;VALUE=DATE:20200105");
  const { completer, puts } = makeCompleter(ics);

  await completer.completeVTodo({}, FILENAME, new Date("2026-09-22T12:00:00Z"));

  assert.equal(prop(puts[0].data, "VTODO", "DUE"), "20200105");
});

test("a failing write propagates instead of reporting success", async () => {
  const completer = new VTodoCompleter({
    getFileContents: async () => ({ data: buildIcs() }),
    putFileContents: async () => {
      throw new Error("CalDAV write failed with 403 Forbidden");
    },
  });

  await assert.rejects(() => completer.completeVTodo({}, FILENAME), /403/);
});

test("CRLF content is recognised as recurring just like LF content", async () => {
  /*
   * Every RFC 5545 server returns CRLF. The parser used to keep the CR on the
   * component name, so "VTODO\r" never matched "VTODO": no property was ever
   * found, completion appended its properties after END:VCALENDAR and the
   * recurring path was never entered at all.
   */
  const crlf = buildIcs({ rrule: "FREQ=DAILY" });
  const lf = crlf.replace(/\r\n/g, "\n");

  for (const [label, ics] of [
    ["CRLF", crlf],
    ["LF", lf],
  ]) {
    const { completer, puts } = makeCompleter(ics);
    await completer.completeVTodo({}, FILENAME, new Date("2026-09-22T12:00:00Z"));

    assert.equal(puts.length, 2, `${label}: recurring path must run`);
    for (const put of puts) {
      const body = put.data;
      assert.ok(!/END:VCALENDAR\r\n./.test(body), `${label}: nothing may be appended after END:VCALENDAR`);
      assert.ok(!body.includes("\r\r"), `${label}: no doubled carriage return`);
    }
    assert.equal(prop(puts[0].data, "VTODO", "STATUS"), "COMPLETED");
  }
});

test("completing an occurrence uses up one step of a COUNT rule", async () => {
  // Far enough in the future that the "never hand out a past date" clamp does
  // not skip any occurrence.
  const { completer, puts } = makeCompleter(
    buildIcs({ rrule: "FREQ=WEEKLY;COUNT=3" })
      .replace("DTSTART:20200105T080000Z", "DTSTART:20990105T080000Z")
      .replace("DUE:20200105T100000Z", "DUE:20990105T100000Z"),
  );

  await completer.completeVTodo({}, FILENAME, new Date("2026-09-22T12:00:00Z"));

  const series = puts[1];
  assert.equal(prop(series.data, "VTODO", "RRULE"), "FREQ=WEEKLY;COUNT=2");
  assert.equal(prop(series.data, "VTODO", "DTSTART"), "20990112T080000Z");
});

test("a COUNT rule that fell behind only keeps the occurrences still ahead", async () => {
  /*
   * Five daily occurrences from 2020: all are in the past, so the series jumps
   * straight to today and the skipped ones must be counted as used up rather
   * than deducting a single step.
   */
  const { completer, puts } = makeCompleter(
    buildIcs({ rrule: "FREQ=DAILY;COUNT=5" }).replace(
      "DTSTART:20200105T080000Z",
      `DTSTART:${new Date(Date.now() - 2 * 86400000).toISOString().slice(0, 10).replace(/-/g, "")}T080000Z`,
    ),
  );

  await completer.completeVTodo({}, FILENAME, new Date());

  const series = puts[1];
  // Two of the five are behind us, so three remain from today onwards.
  assert.equal(prop(series.data, "VTODO", "RRULE"), "FREQ=DAILY;COUNT=3");
});

test("an UNTIL rule is left alone when the series moves", async () => {
  const { completer, puts } = makeCompleter(buildIcs({ rrule: "FREQ=WEEKLY;UNTIL=20991231T100000Z" }));

  await completer.completeVTodo({}, FILENAME, new Date("2026-09-22T12:00:00Z"));

  assert.equal(prop(puts[1].data, "VTODO", "RRULE"), "FREQ=WEEKLY;UNTIL=20991231T100000Z");
});

test("a COUNT series runs out instead of recurring forever", async () => {
  let ics = buildIcs({ rrule: "FREQ=WEEKLY;COUNT=3" })
    .replace("DTSTART:20200105T080000Z", "DTSTART:20990105T080000Z")
    .replace("DUE:20200105T100000Z", "DUE:20990105T100000Z");
  const written = [];

  // Feed each completion's result back in, the way the server would.
  for (let i = 0; i < 3; i++) {
    const { completer, puts } = makeCompleter(ics);
    await completer.completeVTodo({}, FILENAME, new Date("2026-09-22T12:00:00Z"));
    const series = puts.find((put) => put.filename === FILENAME);
    written.push(puts.length);
    ics = series.data;
  }

  // Third completion closes the series in place: no new occurrence is written.
  assert.deepEqual(written, [2, 2, 1]);
  assert.equal(prop(ics, "VTODO", "STATUS"), "COMPLETED");
  assert.equal(prop(ics, "VTODO", "DUE"), "20990119T100000Z");
});

test("a folded RRULE is unfolded before the series is moved", async () => {
  // RFC 5545 folds long lines; the rule only reads "FREQ=DAILY" once unfolded.
  const ics = buildIcs({ rrule: "FREQ=DA\r\n ILY" });
  const { completer, puts } = makeCompleter(ics);

  await completer.completeVTodo({}, FILENAME, new Date("2026-09-22T12:00:00Z"));

  assert.equal(puts.length, 2, "recognised as recurring: occurrence plus series");
  const [occurrence, series] = puts;
  // The finished occurrence loses the whole folded property, continuation included.
  assert.ok(!occurrence.data.includes("RRULE"));
  assert.ok(!occurrence.data.includes(" ILY"));
  // The untouched rule goes back to the server exactly as it was folded.
  assert.ok(series.data.includes("RRULE:FREQ=DA\r\n ILY\r\n"));
  assert.equal(prop(series.data, "VTODO", "STATUS"), "NEEDS-ACTION");
});

test("folded lines survive a parse and generate round-trip byte-identically", () => {
  const ics = buildIcs({
    extra: ["DESCRIPTION:A long description that a client folded at seventy-fi", " ve octets"],
  });
  const completer = new VTodoCompleter({});

  const parsed = completer.parseICS(ics);
  assert.equal(completer.generateICS(parsed), ics);
  assert.equal(
    completer.getElementValue(parsed, "VTODO", "DESCRIPTION"),
    "A long description that a client folded at seventy-five octets",
  );
});
