/* Magic Mirror
 * Node Helper: MMM-CalDAV-Tasks
 *
 * By Jan Ryklikas
 * MIT Licensed.
 */

//import TodoManager from './todo-manager.js';

var NodeHelper = require("node_helper");
const { DAVClient } = require("tsdav");
const { transformData, sortList, appendUrlIndex } = require("./transformer");
const { initWebDav, parseList, mapEmptyPriorityTo, mapEmptySortIndexTo, fetchCalendarData, initDAVClient } = require("./webDavHelper");
const VTodoCompleter = require('./vtodo-completer.js');
const Log = require("logger");

module.exports = NodeHelper.create({
	socketNotificationReceived: function (notification, payload) {
		let self = this;
		const moduleId = payload.id;

		// Refresh the tasks list
		if (notification === "MMM-CalDAV-Tasks-UPDATE") {

			self.getData(moduleId, payload.config, (payload) => {
				self.sendData(moduleId, payload);
			});
		}

		// Toggle the status of a task on the server
		if (notification === "MMM-CalDAV-Tasks-TOGGLE") {
			console.log("MMM-CalDAV-Tasks-TOGGLE") //, payload);
			this.toggleStatusViaWebDav(payload.id, payload.status, payload.config, payload.urlIndex, payload.filename);  // up to here the log shows the correct values (92daf9339-baf6 checked {config})
		};
	},


	getData: async function (moduleId, config, callback) {
		let self = this;
		let calendarData = [];

		try {
			let allTasks = [];
			calendarData = await fetchCalendarData(config)

			// iterate over all Arrays
			for (let i = 0; i < calendarData.length; i++) {
				icsList = calendarData[i]["icsStrings"];
				const rawList = parseList(icsList, config.dateFormat);
				const priorityList = mapEmptyPriorityTo(rawList, config.mapEmptyPriorityTo);
				const sortIndexList = mapEmptySortIndexTo(priorityList, config.mapEmptySortIndexTo);
				const indexedList = appendUrlIndex(sortIndexList, i);
				const sortedList = sortList(indexedList, config.sortMethod);
				const sortedAppleList = sortList(sortedList, 'apple');
				const nestedList = transformData(sortedAppleList);
				allTasks = allTasks.concat(nestedList);
				calendarData[i]["tasks"] = nestedList;
			}

			// console.log("[MMM-CalDAV-Tasks] calendar: ", JSON.stringify(calendarData,null,2));
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
	sendData: function (moduleId, payload) {
		this.sendSocketNotification("MMM-CalDAV-Tasks-Helper-TODOS#" + moduleId, payload);
	},

	toggleStatusViaWebDav: async function (id, status, config, urlIndex, filename) {
		// pick the correct url from the config
        const client = initDAVClient(config);
		const completer = new VTodoCompleter(client);
		await completer.completeVTodo(config, filename);
	},

	sendLog: function (moduleId, payload) {
		this.sendSocketNotification("MMM-CalDAV-Tasks-Helper-LOG#" + moduleId, payload);
	},

	sendError: function (moduleId, payload) {
		this.sendSocketNotification("MMM-CalDAV-Tasks-Helper-ERROR#" + moduleId, payload);
	}
});
