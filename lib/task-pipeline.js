/*
 * From raw calendar objects to the task lists the frontend renders: parse,
 * fill empty priorities/sort indexes, sort, nest subtasks, drop hidden tasks.
 */
const { transformData, sortList, appendUrlIndex } = require("./transformer");
const { parseList, mapEmptyPriorityTo, mapEmptySortIndexTo } = require("./webDavHelper");
const { filterVisibleTasks } = require("./task-filter");

/**
 * @param {Array} calendarData - As returned by webDavHelper.fetchCalendarData
 * @param {Object} config - Effective module configuration
 * @param {Date} [now] - Reference time for the visibility filter
 * @returns {{calendars: Array, taskCount: number}} Calendars with their
 *   visible `tasks` (raw ICS removed) and the number of parsed tasks
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
    return { ...rest, tasks: filterVisibleTasks(nestedList, config, now) };
  });

  return { calendars, taskCount };
}

module.exports = { buildTaskLists };
