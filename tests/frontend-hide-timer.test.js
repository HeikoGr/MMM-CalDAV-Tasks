const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const TaskRenderer = require("../lib/task-renderer");

const source = fs.readFileSync(path.join(__dirname, "..", "MMM-CalDAV-Tasks.js"), "utf8");

function loadFrontend() {
  let definition = null;
  const context = vm.createContext({
    Module: { register: (_name, moduleDefinition) => (definition = moduleDefinition) },
    TaskRenderer,
    setTimeout,
    clearTimeout,
  });
  vm.runInContext(source, context);
  return definition;
}

test("a grace period that ran out does not keep redrawing the module", async () => {
  const module = Object.create(loadFrontend());
  let renders = 0;
  module.lifecycle = {
    render: () => {
      renders += 1;
      module.scheduleHideTimer(); // what getDom() does on every render
    },
  };
  module.toDoList = [{ tasks: [{ summary: "done", status: "COMPLETED", hideAt: Date.now() + 20 }] }];

  module.scheduleHideTimer();
  await new Promise((resolve) => setTimeout(resolve, 400));
  clearTimeout(module.hideTimer);

  assert.equal(renders, 1, "one redraw when the grace period ends, then quiet until the next fetch");
});
