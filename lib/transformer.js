const {
  sortPriority,
  sortPriorityDesc,
  sortCreated,
  sortCreatedDesc,
  sortModified,
  sortModifiedDesc,
  sortApple,
} = require("./sort_helper");

function relatedUid(task) {
  const related = task["related-to"];
  return typeof related?.val === "undefined" ? related : related.val;
}

/**
 * Nest subtasks under their parent (RELATED-TO), keeping the order of `tasks`
 * among siblings: the list arrives sorted, and a subtask must not move behind
 * its siblings only because its parent comes later in that list.
 *
 * A task whose parent is missing (deleted, or in a calendar that is not
 * included) stays at the top level, its own subtasks stay under it. A cycle
 * is broken where it closes; every task is shown exactly once.
 * @param {Array} tasks - Parsed tasks, already sorted
 * @returns {Array} Top-level tasks, subtasks in `children`
 */
function transformData(tasks) {
  const byUid = new Map();
  for (const task of tasks) {
    if (!byUid.has(task.uid)) {
      byUid.set(task.uid, task);
    }
  }

  const parentOf = new Map();
  const isAncestor = (candidate, task) => {
    for (let current = candidate; current; current = parentOf.get(current)) {
      if (current === task) return true;
    }
    return false;
  };
  for (const task of tasks) {
    const uid = relatedUid(task);
    const parent = uid === undefined ? undefined : byUid.get(uid);
    if (parent && !isAncestor(parent, task)) {
      parentOf.set(task, parent);
    }
  }

  const topLevel = [];
  for (const task of tasks) {
    const parent = parentOf.get(task);
    if (parent) {
      parent.children = parent.children || [];
      parent.children.push(task);
    } else {
      topLevel.push(task);
    }
  }
  return topLevel;
}

/** Sort in place by `method` ("priority", "created desc", "apple", ...); returns the same array. */
function sortList(rawList, method) {
  switch (method) {
    case "priority":
      rawList.sort(sortPriority);
      break;

    case "priority desc":
      rawList.sort(sortPriorityDesc);
      break;

    case "created":
      rawList.sort(sortCreated);
      break;

    case "created desc":
      rawList.sort(sortCreatedDesc);
      break;

    case "modified":
      rawList.sort(sortModified);
      break;

    case "modified desc":
      rawList.sort(sortModifiedDesc);
      break;

    case "apple":
      rawList.sort(sortApple);
      break;
  }

  return rawList;
}

module.exports = {
  transformData,
  sortList,
};
