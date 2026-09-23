const test = require("node:test");
const assert = require("node:assert/strict");

const { installFakeDocument } = require("./helpers/fake-dom");
const TaskRenderer = require("../lib/task-renderer");
const { bindLongPress } = require("../lib/long-press");

const config = {
  colorize: false,
  displayStartDate: true,
  displayDueDate: true,
  highlightStartedTasks: true,
  highlightOverdueTasks: true,
  hideDateSectionOnCompletion: true,
  showCompletionPercent: false,
  headings: [],
  toggleTime: 1000,
};

function task(overrides = {}) {
  return {
    uid: "u1",
    filename: "https://dav.example/tasks/u1.ics",
    summary: "Trash",
    status: "NEEDS-ACTION",
    priority: "5",
    urlIndex: 0,
    dueISO: null,
    startISO: null,
    ...overrides,
  };
}

test("renders calendars, counts open tasks and shows the progress of done ones", (t) => {
  t.after(installFakeDocument());
  const dom = TaskRenderer.renderModule({
    toDoList: [
      {
        summary: "Home",
        calendarColor: "#f00",
        tasks: [task(), task({ uid: "u2", summary: "Dishes", status: "COMPLETED" })],
      },
    ],
    error: null,
    config,
    instanceId: "module_1",
    now: new Date("2026-09-23T12:00:00Z"),
  });

  assert.equal(dom.dataset.instanceId, "module_1");
  const [calendar] = dom.byClass("MMM-CalDAV-Tasks-Calendar-wrapper");
  assert.equal(calendar.style["--calendar-color"], "#f00");
  assert.equal(dom.byClass("MMM-CalDAV-Tasks-Count")[0].textContent, "1");
  assert.equal(dom.byClass("MMM-CalDAV-Tasks-Progress-Bar")[0].style.width, "50%");
  assert.deepEqual(
    dom.byClass("MMM-CalDAV-Tasks-Summary").map((el) => el.textContent),
    ["Trash", "Dishes"],
  );
  assert.equal(dom.byClass("MMM-CalDAV-Tasks-List-Item")[0].dataset.vtodoFilename, task().filename);
});

test("an error is shown above the previous data, loading only without both", (t) => {
  t.after(installFakeDocument());
  const withData = TaskRenderer.renderModule({
    toDoList: [{ summary: "Home", tasks: [] }],
    error: { title: "Update failed", lines: ["503"], hint: "Showing previous data" },
    config,
  });
  assert.equal(withData.children[0].className, "MMM-CalDAV-Tasks-error");
  assert.equal(withData.byClass("MMM-CalDAV-Tasks-Empty")[0].textContent, "All done");

  const empty = TaskRenderer.renderModule({ toDoList: null, error: null, config });
  assert.equal(empty.textContent, "Loading...");
});

test("an overdue task gets its badge, a completed one hides its dates", (t) => {
  t.after(installFakeDocument());
  const dom = TaskRenderer.renderModule({
    toDoList: [
      {
        summary: "Home",
        tasks: [
          task({ dueISO: "2026-09-20T10:00:00Z", dueFormatted: "20.09.2026" }),
          task({ uid: "u2", status: "COMPLETED", dueISO: "2026-09-20T10:00:00Z" }),
        ],
      },
    ],
    config,
    language: "en",
    now: new Date("2026-09-23T12:00:00Z"),
  });

  const [open, done] = dom.byClass("MMM-CalDAV-Tasks-Date-Section");
  assert.equal(open.byClass("MMM-CalDAV-Tasks-Overdue").length, 1);
  assert.equal(done.style.display, "none");
});

test("a long press flips the item and reports the state it now shows", (t) => {
  t.after(installFakeDocument());
  const reported = [];
  const originalSetTimeout = globalThis.setTimeout;
  const pending = [];
  globalThis.setTimeout = (fn) => pending.push(fn);
  t.after(() => {
    globalThis.setTimeout = originalSetTimeout;
  });

  const dom = TaskRenderer.renderModule({
    toDoList: [{ summary: "Home", tasks: [task()] }],
    config,
    bindItem: (item) =>
      bindLongPress(item, {
        toggleTime: 1000,
        hideDateSectionOnCompletion: true,
        onToggle: (event) => reported.push(event),
      }),
  });
  const [item] = dom.byClass("MMM-CalDAV-Tasks-List-Item");

  item.dispatch("mousedown");
  pending.shift()();

  assert.deepEqual(reported, [{ filename: task().filename, uid: "u1", status: "checked" }]);
  assert.ok(item.classList.contains("MMM-CalDAV-Tasks-Completed"));
  assert.ok(item.querySelector(".fa").classList.contains("fa-check-square"));
});

test("releasing early cancels the toggle", (t) => {
  t.after(installFakeDocument());
  const reported = [];
  const dom = TaskRenderer.renderModule({
    toDoList: [{ summary: "Home", tasks: [task()] }],
    config,
    bindItem: (item) =>
      bindLongPress(item, {
        toggleTime: 60 * 1000,
        hideDateSectionOnCompletion: true,
        onToggle: (event) => reported.push(event),
      }),
  });
  const [item] = dom.byClass("MMM-CalDAV-Tasks-List-Item");
  item.dispatch("mousedown");
  item.dispatch("mouseup");
  assert.deepEqual(reported, []);
});
