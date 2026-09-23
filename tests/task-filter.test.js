const test = require("node:test");
const assert = require("node:assert/strict");

const { filterVisibleTasks, isTaskHidden } = require("../lib/task-filter");

const now = new Date("2026-09-23T12:00:00Z");
const config = {
  hideCompletedTasksAfter: 1,
  startsInDays: 999999,
  dueInDays: 999999,
  showWithoutStart: true,
  showWithoutDue: true,
};

test("a task completed longer ago than hideCompletedTasksAfter is hidden", () => {
  const recent = { status: "COMPLETED", completedISO: "2026-09-23T08:00:00Z" };
  const old = { status: "COMPLETED", completedISO: "2026-09-20T08:00:00Z" };
  const unknown = { status: "COMPLETED", completedISO: null };
  assert.equal(isTaskHidden(recent, config, now), false);
  assert.equal(isTaskHidden(old, config, now), true);
  assert.equal(isTaskHidden(unknown, config, now), true);
});

test("start and due windows and the showWithout* switches apply", () => {
  const narrow = { ...config, startsInDays: 2, dueInDays: 2, showWithoutDue: false };
  assert.equal(isTaskHidden({ startISO: "2026-09-30T00:00:00Z", dueISO: "2026-09-24T00:00:00Z" }, narrow, now), true);
  assert.equal(isTaskHidden({ startISO: "2026-09-24T00:00:00Z", dueISO: "2026-09-24T00:00:00Z" }, narrow, now), false);
  assert.equal(isTaskHidden({ startISO: "2026-09-24T00:00:00Z" }, narrow, now), true, "no due date");
});

test("a hidden task takes its subtasks with it, visible parents keep visible children only", () => {
  const tree = [
    {
      summary: "parent",
      children: [
        { summary: "open child" },
        { summary: "old child", status: "COMPLETED", completedISO: "2026-01-01T00:00:00Z" },
      ],
    },
    {
      summary: "old parent",
      status: "COMPLETED",
      completedISO: "2026-01-01T00:00:00Z",
      children: [{ summary: "orphan" }],
    },
  ];
  const visible = filterVisibleTasks(tree, config, now);
  assert.deepEqual(
    visible.map((task) => [task.summary, (task.children || []).map((c) => c.summary)]),
    [["parent", ["open child"]]],
  );
});
