/*
 * Magic Mirror
 * Node Helper: MMM-CalDAV-Tasks
 *
 * By Jan Ryklikas
 * MIT Licensed.
 */

/* eslint-disable n/no-missing-require */
const NodeHelper = require("node_helper");
/* eslint-enable n/no-missing-require */
const {transformData, sortList, appendUrlIndex} = require("./transformer");
const {parseList, mapEmptyPriorityTo, mapEmptySortIndexTo, fetchCalendarData, initDAVClient} = require("./webDavHelper");
const VTodoCompleter = require("./vtodo-completer.js");

module.exports = NodeHelper.create({
  socketNotificationReceived (notification, payload) {
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


  async getData (moduleId, config, callback) {
    const self = this;
    let calendarData = [];

    try {
      let allTasks = [];
      calendarData = await fetchCalendarData(config);

      // iterate over all Arrays
      for (let i = 0; i < calendarData.length; i++) {
        const icsList = calendarData[i].icsStrings;
        const rawList = parseList(icsList, config.dateFormat);
        const priorityList = mapEmptyPriorityTo(rawList, config.mapEmptyPriorityTo);
        const sortIndexList = mapEmptySortIndexTo(priorityList, config.mapEmptySortIndexTo);
        const indexedList = appendUrlIndex(sortIndexList, i);
        const sortedList = sortList(indexedList, config.sortMethod);
        const sortedAppleList = sortList(sortedList, "apple");
        const nestedList = transformData(sortedAppleList);
        allTasks = allTasks.concat(nestedList);
        calendarData[i].tasks = nestedList;
      }

      callback(calendarData);
    } catch (error) {
      console.error("WebDav", error);
      if (error.status === 401) {
        self.sendError(moduleId, "[MMM-CalDAV-Tasks] WebDav: Unauthorized!");
      } else if (error.status === 404) {
        self.sendError(moduleId, "[MMM-CalDAV-Tasks] WebDav: URL Not Found!");
      } else {
        self.sendError(moduleId, "[MMM-CalDAV-Tasks] WebDav: Unknown error!");
        self.sendLog(moduleId, ["[MMM-CalDAV-Tasks] WebDav: Unknown error: ", error]);
      }
    }
  },

  // TODO: was this the function meant to toggle the status on the server side?
  sendData (moduleId, payload) {
    this.sendSocketNotification(`MMM-CalDAV-Tasks-Helper-TODOS#${moduleId}`, payload);
  },

  async toggleStatusViaWebDav (config, filename) {
    const client = initDAVClient(config);
    const completer = new VTodoCompleter(client);
    await completer.completeVTodo(config, filename);
  },

  sendLog (moduleId, payload) {
    this.sendSocketNotification(`MMM-CalDAV-Tasks-Helper-LOG#${moduleId}`, payload);
  },

  sendError (moduleId, payload) {
    this.sendSocketNotification(`MMM-CalDAV-Tasks-Helper-ERROR#${moduleId}`, payload);
  }
});
