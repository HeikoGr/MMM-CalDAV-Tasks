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

/** Plain-object snapshot of a fake DOM tree, for comparing two renderings. */
function snapshot(el) {
  return {
    tag: el.tagName,
    className: el.className,
    dataset: { ...el.dataset },
    style: { ...el.style },
    text: el.ownText,
    drawn: el.drawn,
    children: el.children.map(snapshot),
  };
}

test("only the fields the display renders reach the browser, and it renders the same", (t) => {
  const { installFakeDocument } = require("./helpers/fake-dom");
  const TaskRenderer = require("../lib/task-renderer");
  t.after(installFakeDocument());
  // Record what the completion chart draws, so its input takes part in the comparison.
  const createElement = document.createElement;
  document.createElement = (tag) => {
    const el = createElement(tag);
    if (tag === "canvas") {
      el.drawn = [];
      el.getContext = () =>
        new Proxy(
          {},
          {
            get:
              (_target, key) =>
              (...args) =>
                el.drawn.push([key, ...args]),
            set: () => true,
          },
        );
    }
    return el;
  };

  const now = new Date("2026-11-12T12:00:00Z");
  const config = normalizeConfig({
    webDavAuth: auth,
    colorize: true,
    headings: ["Home"],
    showCompletionPercent: true,
    hideCompletedTasksAfter: 0,
    completedTaskGracePeriod: 120,
  });
  const icsStrings = [
    vtodo("parent", [
      "PRIORITY:1",
      "PERCENT-COMPLETE:40",
      "DTSTART:20261110T080000Z",
      "DUE;VALUE=DATE:20261115",
      "RRULE:FREQ=WEEKLY",
      "DESCRIPTION:door code 4711",
      "LOCATION:Main Street 1",
      "ATTENDEE;CN=Alice:mailto:alice@example.org",
      "ORGANIZER:mailto:bob@example.org",
    ]),
    vtodo("child", ["RELATED-TO:parent", "DESCRIPTION:child note", "DUE:20261111T090000Z"]),
    vtodo("done", ["STATUS:COMPLETED", "COMPLETED:20261112T115900Z", "LOCATION:Office"]),
    vtodo("later", ["DTSTART:20261201T080000Z", "DUE:20261224T100000Z"]),
    vtodo("today", ["DTSTART;VALUE=DATE:20261112"]),
  ];

  // The same pipeline without the last step, as it ran before (CT-PRIV-01).
  const { parseList, mapEmptyPriorityTo, mapEmptySortIndexTo } = require("../lib/webDavHelper");
  const { transformData, sortList, appendUrlIndex } = require("../lib/transformer");
  const { filterVisibleTasks } = require("../lib/task-filter");
  const full = filterVisibleTasks(
    transformData(
      sortList(
        sortList(
          appendUrlIndex(
            mapEmptySortIndexTo(
              mapEmptyPriorityTo(parseList(icsStrings, config.dateFormat), config.mapEmptyPriorityTo),
              config.mapEmptySortIndexTo,
            ),
            0,
          ),
          config.sortMethod,
        ),
        "apple",
      ),
    ),
    config,
    now,
  );

  const [calendar] = buildTaskLists([{ url: "cal", summary: "Cal", icsStrings }], config, now).calendars;
  const payload = JSON.stringify(calendar.tasks);
  for (const secret of ["door code", "child note", "Main Street", "Office", "alice@example.org", "bob@example.org"]) {
    assert.ok(!payload.includes(secret), `"${secret}" must not reach the browser`);
  }
  assert.ok(!payload.includes('"related-to"'));
  assert.equal(calendar.tasks[0].children[0].uid, "child", "nesting survives");
  assert.equal(calendar.tasks[0].rrule, true);

  const render = (tasks) =>
    snapshot(TaskRenderer.renderModule({ toDoList: [{ summary: "Cal", tasks }], config, identifier: "m", now }));
  assert.deepEqual(render(calendar.tasks), render(full));
});
