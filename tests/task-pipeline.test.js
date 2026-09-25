const test = require("node:test");
const assert = require("node:assert/strict");
const { buildTaskLists } = require("../lib/task-pipeline");
const { normalizeConfig } = require("../lib/config-validator");

const auth = { url: "https://cloud.example/remote.php/dav/", username: "u", password: "p" };

function vtodo(uid, lines = []) {
  return {
    filename: `${uid}.ics`,
    icsStr: [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "BEGIN:VTODO",
      `UID:${uid}`,
      `SUMMARY:${uid}`,
      ...lines,
      "END:VTODO",
      "END:VCALENDAR",
    ].join("\n"),
  };
}

function summaries(icsStrings, options) {
  const config = normalizeConfig({ webDavAuth: auth, ...options });
  return buildTaskLists([{ url: "cal", summary: "Cal", icsStrings }], config).calendars[0].tasks.map((t) => t.summary);
}

test("a manual order (X-APPLE-SORT-ORDER) takes precedence, sortMethod orders the rest", () => {
  const order = summaries(
    [
      vtodo("manual-2-prio-1", ["PRIORITY:1", "X-APPLE-SORT-ORDER:2"]),
      vtodo("unordered-prio-9", ["PRIORITY:9"]),
      vtodo("manual-1-prio-9", ["PRIORITY:9", "X-APPLE-SORT-ORDER:1"]),
      vtodo("unordered-prio-1", ["PRIORITY:1"]),
    ],
    { sortMethod: "priority" },
  );

  assert.deepEqual(order, ["manual-1-prio-9", "manual-2-prio-1", "unordered-prio-1", "unordered-prio-9"]);
});

test("created sorting stays ordered when a task has no CREATED", () => {
  const icsStrings = [
    vtodo("late", ["CREATED:20260901T000000Z"]),
    vtodo("none"),
    vtodo("early", ["CREATED:20250101T000000Z"]),
  ];

  assert.deepEqual(summaries(icsStrings, { sortMethod: "created" }), ["early", "late", "none"]);
  assert.deepEqual(summaries(icsStrings, { sortMethod: "created desc" }), ["late", "early", "none"]);
});
