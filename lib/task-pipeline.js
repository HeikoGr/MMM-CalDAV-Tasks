/*
 * From raw calendar objects to the task lists the frontend renders: parse,
 * fill empty priorities/sort indexes, sort, nest subtasks, drop hidden tasks.
 * The steps that fill and sort change the parsed tasks in place.
 */
const ical = require("node-ical");
const moment = require("moment");
const { transformData, sortList } = require("./transformer");
const { filterVisibleTasks } = require("./task-filter");

/*
 * What the browser reads of a task (lib/task-renderer.js, lib/long-press.js via the
 * item's dataset). Everything else node-ical parsed - description, attendees,
 * location, organizer, raw dates - stays on the server.
 */
const DISPLAY_FIELDS = [
  "uid",
  "filename",
  "summary",
  "status",
  "priority",
  "priorityUnset",
  "completion",
  "dueISO",
  "dueDateOnly",
  "dueFormatted",
  "startISO",
  "startDateOnly",
  "startFormatted",
  "hideAt",
];

// node-ical has returned date properties both as bare Dates and as { val } over
// its 0.27.x line, so unwrap defensively rather than pinning a version.
function toDate(value) {
  const raw = value?.val ?? value;
  if (!raw) {
    return null;
  }
  const date = raw instanceof Date ? raw : new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

// An all-day task carries no meaningful time, so drop the time tokens from the
// user's format instead of rendering a misleading "00:00".
function stripTimeTokens(dateFormat) {
  return dateFormat.replace(/[\s,]*H{1,2}[:.]mm(?:[:.]ss)?/g, "").trim();
}

function formatDate(date, dateFormat, dateOnly) {
  return moment(date).format(dateOnly ? stripTimeTokens(dateFormat) : dateFormat);
}

/**
 * @param {Array<{filename: string, icsStr: string}>} icsStrings - Raw calendar objects
 * @param {string} dateFormat - moment format for the displayed dates
 * @returns {Array} The VTODOs as node-ical parsed them, plus filename and normalized dates
 */
function parseList(icsStrings, dateFormat) {
  const elements = [];

  for (const { filename, icsStr } of icsStrings) {
    const icsObj = ical.sync.parseICS(icsStr);
    Object.values(icsObj).forEach((element) => {
      if (element.type !== "VTODO") {
        return;
      }

      element.filename = filename;

      const due = toDate(element.due);
      const start = toDate(element.start);
      const completed = toDate(element.completed);

      /*
       * Normalize every date to ISO here so the frontend can compare real Date
       * objects. It must never parse the formatted strings back.
       */
      element.dueISO = due ? due.toISOString() : null;
      element.startISO = start ? start.toISOString() : null;
      element.completedISO = completed ? completed.toISOString() : null;
      element.dueDateOnly = Boolean(element.due?.dateOnly);
      element.startDateOnly = Boolean(element.start?.dateOnly);

      if (due) {
        element.dueFormatted = formatDate(due, dateFormat, element.dueDateOnly);
      }
      if (start) {
        element.startFormatted = formatDate(start, dateFormat, element.startDateOnly);
      }

      elements.push(element);
    });
  }

  return elements;
}

/**
 * Give tasks without a priority the configured one, in place.
 * @param {Array} tasks - Parsed tasks
 * @param {number} fallback - config.mapEmptyPriorityTo
 */
function fillEmptyPriority(tasks, fallback) {
  for (const task of tasks) {
    if (!Object.hasOwn(task, "priority") || task.priority === null || task.priority === "0") {
      // Only sorting and colors use the mapped value; the "!" mark must not.
      task.priorityUnset = true;
      task.priority = fallback.toString();
    }
  }
}

/**
 * Give tasks without a manual order (X-APPLE-SORT-ORDER) the configured index, in place.
 * @param {Array} tasks - Parsed tasks
 * @param {number} fallback - config.mapEmptySortIndexTo
 */
function fillEmptySortIndex(tasks, fallback) {
  for (const task of tasks) {
    if (
      !Object.hasOwn(task, "APPLE-SORT-ORDER") ||
      task["APPLE-SORT-ORDER"] === null ||
      task["APPLE-SORT-ORDER"] === "0"
    ) {
      task["APPLE-SORT-ORDER"] = fallback.toString();
    }
  }
}

/**
 * Parse, fill, sort and nest the tasks of one calendar - everything but the visibility filter.
 * @param {Array} icsStrings - Raw calendar objects of the calendar
 * @param {Object} config - Effective module configuration
 * @returns {{tasks: Array, parsedCount: number}} Top-level tasks (subtasks in `children`) and the
 *   number of parsed tasks
 */
function prepareTasks(icsStrings, config) {
  const tasks = parseList(icsStrings, config.dateFormat);
  fillEmptyPriority(tasks, config.mapEmptyPriorityTo);
  fillEmptySortIndex(tasks, config.mapEmptySortIndexTo);
  // A manual order (X-APPLE-SORT-ORDER, set by Apple Reminders or the Nextcloud Tasks app)
  // wins: sort is stable, so the second pass makes it the primary key and sortMethod only
  // orders tasks without one (fillEmptySortIndex puts those last).
  sortList(tasks, config.sortMethod);
  sortList(tasks, "apple");
  return { tasks: transformData(tasks), parsedCount: tasks.length };
}

/**
 * @param {Object} task - Parsed, nested and filtered task
 * @returns {Object} Only the fields the frontend renders, children likewise
 */
function toDisplayTask(task) {
  const display = {};
  for (const field of DISPLAY_FIELDS) {
    if (task[field] !== undefined) {
      display[field] = task[field];
    }
  }
  // The renderer only shows a repeat icon; the parsed rule object is not needed.
  if (task.rrule) {
    display.rrule = true;
  }
  if (Array.isArray(task.children)) {
    display.children = task.children.map(toDisplayTask);
  }
  return display;
}

/**
 * @param {Array} calendarData - As returned by webDavHelper.fetchCalendarData
 * @param {Object} config - Effective module configuration
 * @param {Date} [now] - Reference time for the visibility filter
 * @returns {{calendars: Array, taskCount: number}} Calendars with their
 *   visible `tasks` (raw ICS removed, display fields only) and the number of parsed tasks
 */
function buildTaskLists(calendarData, config, now = new Date()) {
  let taskCount = 0;

  const calendars = calendarData.map((calendar) => {
    // The raw ICS is only needed for parsing; the frontend never reads it.
    const { icsStrings, ...rest } = calendar;
    const { tasks, parsedCount } = prepareTasks(icsStrings, config);
    taskCount += parsedCount;
    return { ...rest, tasks: filterVisibleTasks(tasks, config, now).map(toDisplayTask) };
  });

  return { calendars, taskCount };
}

module.exports = { buildTaskLists, parseList, prepareTasks };
