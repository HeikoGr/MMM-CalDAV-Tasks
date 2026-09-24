/*
 * Which tasks the module shows (MODULE-PLAN C2: the backend filters, the
 * frontend only renders). Runs in node_helper on every fetch.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

function parseISO(iso) {
  if (!iso) {
    return null;
  }
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Checks if a task is hidden by the date and completion options.
 *
 * @param {Object} element - Task as produced by webDavHelper.parseList
 * @param {Object} config - Effective module configuration
 * @param {Date} [now] - Reference time
 * @returns {boolean} True if the task is hidden
 */
function isTaskHidden(element, config, now = new Date()) {
  // Hide completed tasks after certain days
  if (element.status === "COMPLETED" && config.hideCompletedTasksAfter !== null) {
    const completed = parseISO(element.completedISO);
    // Without a COMPLETED timestamp the age is unknown - treat it as due for
    // hiding rather than keeping the task around forever.
    if (!completed) {
      return true;
    }
    const daysSinceCompleted = (now - completed) / DAY_MS;
    if (daysSinceCompleted > config.hideCompletedTasksAfter) {
      // A task completed moments ago stays for the grace period, so the
      // frontend can count it down (hideAt) and a mistaken tap can be undone.
      const hideAt = completed.getTime() + (config.completedTaskGracePeriod || 0) * 1000;
      if (hideAt <= now.getTime()) {
        return true;
      }
      element.hideAt = hideAt;
    }
  }

  const start = parseISO(element.startISO);
  if (start) {
    const daysUntilStart = (start - now) / DAY_MS;
    if (daysUntilStart > config.startsInDays) {
      return true;
    }
  } else if (!config.showWithoutStart) {
    return true;
  }

  const due = parseISO(element.dueISO);
  if (due) {
    const daysUntilDue = (due - now) / DAY_MS;
    if (daysUntilDue > config.dueInDays) {
      return true;
    }
  } else if (!config.showWithoutDue) {
    return true;
  }

  return false;
}

/**
 * Drop hidden tasks from a nested task tree. A hidden task takes its subtasks
 * with it, as the frontend did before.
 *
 * @param {Array} tasks - Task tree
 * @param {Object} config - Effective module configuration
 * @param {Date} [now] - Reference time
 * @returns {Array} The visible tasks, children filtered the same way
 */
function filterVisibleTasks(tasks, config, now = new Date()) {
  const visible = [];
  for (const task of tasks || []) {
    if (isTaskHidden(task, config, now)) {
      continue;
    }
    if (Array.isArray(task.children)) {
      const children = filterVisibleTasks(task.children, config, now);
      if (children.length > 0) {
        task.children = children;
      } else {
        delete task.children;
      }
    }
    visible.push(task);
  }
  return visible;
}

module.exports = { isTaskHidden, filterVisibleTasks };
