/*
 * From raw calendar objects to the task lists the frontend renders: parse,
 * fill empty priorities/sort indexes, sort, nest subtasks, drop hidden tasks.
 */
const { transformData, sortList, appendUrlIndex } = require("./transformer");
const { parseList, mapEmptyPriorityTo, mapEmptySortIndexTo } = require("./webDavHelper");
const { filterVisibleTasks } = require("./task-filter");

/*
 * What the browser reads of a task (lib/task-renderer.js, lib/long-press.js via the
 * item's dataset). Everything else node-ical parsed - description, attendees,
 * location, organizer, raw dates - stays on the server.
 */
const DISPLAY_FIELDS = [
  "uid",
  "filename",
  "urlIndex",
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

  const calendars = calendarData.map((calendar, index) => {
    const { icsStrings, ...rest } = calendar;
    const rawList = parseList(icsStrings, config.dateFormat);
    const priorityList = mapEmptyPriorityTo(rawList, config.mapEmptyPriorityTo);
    const sortIndexList = mapEmptySortIndexTo(priorityList, config.mapEmptySortIndexTo);
    const indexedList = appendUrlIndex(sortIndexList, index);
    // A manual order (X-APPLE-SORT-ORDER, set by Apple Reminders or the Nextcloud Tasks app)
    // wins: sort is stable, so the second pass makes it the primary key and sortMethod only
    // orders tasks without one (mapEmptySortIndexTo puts those last).
    const sortedList = sortList(indexedList, config.sortMethod);
    const nestedList = transformData(sortList(sortedList, "apple"));
    taskCount += rawList.length;

    // The raw ICS is only needed for parsing; the frontend never reads it.
    return { ...rest, tasks: filterVisibleTasks(nestedList, config, now).map(toDisplayTask) };
  });

  return { calendars, taskCount };
}

module.exports = { buildTaskLists, toDisplayTask };
