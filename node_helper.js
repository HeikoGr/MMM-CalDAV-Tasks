/*
 * MagicMirror²
 * Node Helper: MMM-CalDAV-Tasks
 *
 * By Jan Ryklikas
 * MIT Licensed.
 */

/* eslint-disable n/no-missing-require */
const NodeHelper = require("node_helper");
/* eslint-enable n/no-missing-require */
const { transformData, sortList, appendUrlIndex } = require("./transformer");
const {
  parseList,
  mapEmptyPriorityTo,
  mapEmptySortIndexTo,
  fetchCalendarData,
  initDAVClient
} = require("./webDavHelper");
const VTodoCompleter = require("./vtodo-completer.js");
const { handleError } = require("./error-handler");
const { validateConfig } = require("./config-validator");

module.exports = NodeHelper.create({
  socketNotificationReceived(notification, payload) {
    const self = this;
    const moduleId = payload.id;
    console.log(`Module ID: ${moduleId}`);

    // Refresh the tasks list
    if (notification === "MMM-CalDAV-Tasks-UPDATE") {
      self.getData(moduleId, payload.config, (payload) => {
        self.sendData(moduleId, payload);
      });
    }

    // Toggle the status of a task on the server
    if (notification === "MMM-CalDAV-Tasks-TOGGLE") {
      console.log("MMM-CalDAV-Tasks-TOGGLE"); // , payload);
      this.toggleStatusViaWebDav(payload.config, payload.filename); // up to here the log shows the correct values (92daf9339-baf6 checked {config})
    }
  },

  async getData(moduleId, config, callback) {
    const self = this;
    let calendarData = [];

    try {
      // Validate and normalize configuration
      const {
        valid,
        config: normalizedConfig,
        errors
      } = validateConfig(config);

      if (!valid) {
        const criticalErrors = errors.filter((e) => e.type !== "deprecation");
        if (criticalErrors.length > 0) {
          const errorMsg = criticalErrors.map((e) => e.message).join("; ");
          throw new Error(`Configuration error: ${errorMsg}`);
        }

        // Log deprecation warnings
        errors
          .filter((e) => e.type === "deprecation")
          .forEach((e) => console.warn(`[MMM-CalDAV-Tasks] ${e.message}`));
      }

      // Use normalized config with defaults
      const effectiveConfig = { ...config, ...normalizedConfig };

      let allTasks = [];
      calendarData = await fetchCalendarData(effectiveConfig);

      // iterate over all Arrays
      for (let i = 0; i < calendarData.length; i++) {
        const icsList = calendarData[i].icsStrings;
        const rawList = parseList(icsList, effectiveConfig.dateFormat);
        const priorityList = mapEmptyPriorityTo(
          rawList,
          effectiveConfig.mapEmptyPriorityTo
        );
        const sortIndexList = mapEmptySortIndexTo(
          priorityList,
          effectiveConfig.mapEmptySortIndexTo
        );
        const indexedList = appendUrlIndex(sortIndexList, i);
        const sortedList = sortList(indexedList, effectiveConfig.sortMethod);
        const sortedAppleList = sortList(sortedList, "apple");
        const nestedList = transformData(sortedAppleList);
        allTasks = allTasks.concat(nestedList);
        calendarData[i].tasks = nestedList;
      }

      callback(calendarData);
    } catch (error) {
      handleError(error, moduleId, self.sendError.bind(self));
    }
  },

  // TODO: was this the function meant to toggle the status on the server side?
  sendData(moduleId, payload) {
    this.sendSocketNotification(
      `MMM-CalDAV-Tasks-Helper-TODOS#${moduleId}`,
      payload
    );
  },

  async toggleStatusViaWebDav(config, filename) {
    try {
      const client = initDAVClient(config);
      const completer = new VTodoCompleter(client);
      await completer.completeVTodo(config, filename);
    } catch (error) {
      console.error("[MMM-CalDAV-Tasks] Toggle error:", error);
    }
  },

  sendLog(moduleId, payload) {
    this.sendSocketNotification(
      `MMM-CalDAV-Tasks-Helper-LOG#${moduleId}`,
      payload
    );
  },

  sendError(moduleId, payload) {
    this.sendSocketNotification(
      `MMM-CalDAV-Tasks-Helper-ERROR#${moduleId}`,
      payload
    );
  }
});
