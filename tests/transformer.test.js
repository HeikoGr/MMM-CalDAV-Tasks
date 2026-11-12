const test = require("node:test");
const assert = require("node:assert/strict");

const { transformData } = require("../lib/transformer");

/** A parsed task; `parent` becomes RELATED-TO, as node-ical delivers it (string or { val }). */
function task(uid, parent, { wrapped = false } = {}) {
  const t = { uid, summary: uid };
  if (parent) {
    t["related-to"] = wrapped ? { val: parent, params: { RELTYPE: "PARENT" } } : parent;
  }
  return t;
}

/** uid tree: [uid, [children...]]; siblings sorted, the order is not under test here. */
function tree(tasks) {
  return tasks
    .map((t) => (t.children ? [t.uid, tree(t.children)] : t.uid))
    .sort((a, b) => String(a).localeCompare(String(b)));
}

test("subtasks are nested under their parent, also when they come first", () => {
  const nested = transformData([task("child", "parent"), task("other"), task("parent")]);
  assert.deepEqual(tree(nested), ["other", ["parent", ["child"]]]);
});

test("grandchildren end up under their parent at any depth and in either order", () => {
  const nested = transformData([
    task("grandchild", "child"),
    task("child", "root", { wrapped: true }),
    task("root"),
    task("second-child", "root"),
  ]);
  assert.deepEqual(tree(nested), [["root", [["child", ["grandchild"]], "second-child"]]]);
});

test("a task whose parent is missing stays visible at the top instead of looping", () => {
  const nested = transformData([task("root"), task("orphan", "deleted-task"), task("orphans-child", "orphan")]);
  assert.deepEqual(tree(nested), [["orphan", ["orphans-child"]], "root"]);
});

test("tasks that only point at each other are all shown, without looping", () => {
  const nested = transformData([task("a", "b"), task("b", "a")]);
  assert.deepEqual(tree(nested), [["b", ["a"]]]);
  assert.deepEqual(tree(transformData([task("self", "self")])), ["self"]);
});

/** Like tree(), but keeps the sibling order. */
function orderedTree(tasks) {
  return tasks.map((t) => (t.children ? [t.uid, orderedTree(t.children)] : t.uid));
}

test("subtasks keep the sorted order among their siblings, wherever their parent sorts", () => {
  // Sorted list: the first child sorts before its parent, the second after it (CT-QUAL-02).
  const nested = transformData([
    task("child-1", "root"),
    task("grandchild", "child-1"),
    task("root"),
    task("child-2", "root"),
    task("child-3", "root", { wrapped: true }),
  ]);
  assert.deepEqual(orderedTree(nested), [["root", [["child-1", ["grandchild"]], "child-2", "child-3"]]]);
});
