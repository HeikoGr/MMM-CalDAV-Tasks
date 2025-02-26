/* Magic Mirror
 * Node Helper: MMM-NextCloud-Tasks
 *
 * By Jan Ryklikas
 * MIT Licensed.
 */

//import TodoManager from './todo-manager.js';

var NodeHelper = require("node_helper");
const { transformData, sortList, appendUrlIndex } = require("./transformer");
const { initWebDav, fetchList, parseList, mapEmptyPriorityTo } = require("./webDavHelper");
const { createClient } = require('webdav');
const VTodoCompleter = require('./vtodo-completer.js');

module.exports = NodeHelper.create({
	socketNotificationReceived: function (notification, payload) {
		let self = this;
		const moduleId = payload.id;

		// Refresh the tasks list
		if (notification === "MMM-NextCloud-Tasks-UPDATE") {

			self.getData(moduleId, payload.config, (payload) => {
				self.sendData(moduleId, payload);
			});
		}

		// Toggle the status of a task on the server
		if (notification === "MMM-NextCloud-Tasks-TOGGLE") {
			console.log("MMM-NextCloud-Tasks-TOGGLE") //, payload);
			this.toggleStatusViaWebDav(payload.id, payload.status, payload.config, payload.urlIndex, payload.filename);  // up to here the log shows the correct values (92daf9339-baf6 checked {config})
		};
	},


	getData: async function (moduleId, config, callback) {
		let self = this;
		try {
			let allTasks = [];
			// iterate over all urls in the config and fetch the tasks
			for (let i = 0; i < config.listUrl.length; i++) {
				let configWithSingleUrl = { ...config, listUrl: config.listUrl[i] };
				 // console.log("[MMM-Nextcloud-Tasks] getData - configWithSingleUrl: ", configWithSingleUrl);
				const icsList = await fetchList(configWithSingleUrl); // also add the filename to the icsStrings
				const rawList = parseList(icsList, config.dateFormat);
				const priorityList = mapEmptyPriorityTo(rawList, config.mapEmptyPriorityTo);
				const indexedList = appendUrlIndex(priorityList, i);
				const sortedList = sortList(indexedList, config.sortMethod);
				const nestedList = transformData(sortedList);
				allTasks = allTasks.concat(nestedList);
			}
			callback(allTasks);

		} catch (error) {
			console.error("WebDav", error);
			if (error.status === 401) {
				self.sendError(moduleId, "[MMM-Nextcloud-Tasks] WebDav: Unauthorized!");
			} else if (error.status === 404) {
				self.sendError(moduleId, "[MMM-Nextcloud-Tasks] WebDav: URL Not Found!");
			} else {
				self.sendError(moduleId, "[MMM-Nextcloud-Tasks] WebDav: Unknown error!");
				self.sendLog(moduleId, ["[MMM-Nextcloud-Tasks] WebDav: Unknown error: ", error]);
			}
		}
	},

	// TODO: was this the function meant to toggle the status on the server side?
	sendData: function (moduleId, payload) {
		this.sendSocketNotification("MMM-NextCloud-Tasks-Helper-TODOS#" + moduleId, payload);
	},

	toggleStatusViaWebDav: async function (id, status, config, urlIndex, filename) {
		// pick the correct url from the config
//
		let configWithSingleUrl = { ...config, listUrl: config.listUrl[urlIndex] };
//
//		const webdavUrl = 'https://***REMOVED***/dav.php/calendars/***REMOVED***/default/';
//		const username = '***REMOVED***';
//		const password = '***REMOVED***';
//
//		const client = createClient(webdavUrl, { username: username, password: password });
                const client = initWebDav(configWithSingleUrl);

		//const todoManager = new TodoManager(client);

		// Aufruf mit optionalem Abschlussdatum
		//await todoManager.completeTask(filename);
		const completer = new VTodoCompleter(client);
		await completer.completeVTodo(filename);

	},

	sendLog: function (moduleId, payload) {
		this.sendSocketNotification("MMM-NextCloud-Tasks-Helper-LOG#" + moduleId, payload);
	},

	sendError: function (moduleId, payload) {
		this.sendSocketNotification("MMM-NextCloud-Tasks-Helper-ERROR#" + moduleId, payload);
	}
});
