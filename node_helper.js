/* Magic Mirror
 * Node Helper: MMM-NextCloud-Tasks
 *
 * By Jan Ryklikas
 * MIT Licensed.
 */

var NodeHelper = require("node_helper");
const { transformData, sortList, appendUrlIndex} = require("./transformer");
const { initWebDav, fetchList, parseList, mapEmptyPriorityTo } = require("./webDavHelper");


module.exports = NodeHelper.create({
	socketNotificationReceived: function(notification, payload) {
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
			console.log("MMM-NextCloud-Tasks-TOGGLE", payload);
			this.toggleStatusViaWebDav(payload.id, payload.status, payload.config, payload.urlIndex, payload.filename);  // up to here the log shows the correct values (92daf9339-baf6 checked {config})
			};
		},
	

	getData: async function(moduleId, config, callback) {
		let self = this;
		try {
			let allTasks = [];
			// iterate over all urls in the config and fetch the tasks
			for (let i = 0; i < config.listUrl.length; i++) {
				let configWithSingleUrl = { ...config, listUrl: config.listUrl[i] };
				console.log("[MMM-Nextcloud-Tasks] getData - configWithSingleUrl: ", configWithSingleUrl);
				const icsList = await fetchList(configWithSingleUrl); // also add the filename to the icsStrings
				const rawList = parseList(icsList);
				const priorityList = mapEmptyPriorityTo(rawList, config.mapEmptyPriorityTo);
				const indexedList = appendUrlIndex(priorityList, i);
				const sortedList = sortList(indexedList, config.sortMethod);
				const nestedList = transformData(sortedList);
				allTasks = allTasks.concat(nestedList);
			}
			callback(allTasks);
			
		} catch (error) {
			console.error("WebDav", error);
			if(error.status === 401) {
				self.sendError(moduleId, "WebDav: Unauthorized!");
			} else if(error.status === 404) {
				self.sendError(moduleId, "WebDav: URL Not Found!");
			} else {
				self.sendError(moduleId, "WebDav: Unknown error!");
				self.sendLog(moduleId, ["WebDav: Unknown error: ", error]);
			}
		}
	},

	// TODO: was this the function meant to toggle the status on the server side?
	sendData: function(moduleId, payload) {
		this.sendSocketNotification("MMM-NextCloud-Tasks-Helper-TODOS#" + moduleId, payload);
		},

	toggleStatusViaWebDav: async function(id, status, config, urlIndex, filename) {
		// pick the correct url from the config
		let configWithSingleUrl = { ...config, listUrl: config.listUrl[urlIndex] };
		const client = initWebDav(configWithSingleUrl);


		async function downloadCompleteFile(filename) {
			try {	
				const fileContents = await client.getFileContents(filename, { format: "text" });
				console.log("File contents:", fileContents);
				return fileContents;
			} catch (error) {
				console.error("Error during file download:", error);
				return null;
			}
		}
		async function modifyFile(vtodoContent) {
			// Determine new status by toggling existing or defaulting to COMPLETED
			let updatedStatus = "COMPLETED";
			let modifiedContent = vtodoContent;
			if (modifiedContent.includes("STATUS:")) {
				modifiedContent = modifiedContent.replace(/STATUS:(\w+)/, (match, p1) => {
					return p1 === "COMPLETED" ? "STATUS:PENDING" : "STATUS:COMPLETED";
				});
				updatedStatus = /STATUS:(\w+)/.exec(modifiedContent)[1];
			} else {
				modifiedContent = modifiedContent.replace("END:VTODO", "STATUS:COMPLETED\nEND:VTODO");
			}

			// Prepare current datetime in ICS format
			let icsNow = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';

			// Update LAST-MODIFIED:
			modifiedContent = modifiedContent.replace(/LAST-MODIFIED:.+/, `LAST-MODIFIED:${icsNow}`);

			// Update PERCENT-COMPLETED:
			if (modifiedContent.includes("PERCENT-COMPLETED:")) {
				modifiedContent = modifiedContent.replace(/PERCENT-COMPLETED:\d+/, updatedStatus === "COMPLETED"
					? "PERCENT-COMPLETED:100"
					: "PERCENT-COMPLETED:0"
				);
			}

			// Handle COMPLETED:
			if (updatedStatus === "COMPLETED") {
				if (modifiedContent.includes("COMPLETED:")) {
					modifiedContent = modifiedContent.replace(/COMPLETED:.+/, `COMPLETED:${icsNow}`);
				} else {
					modifiedContent = modifiedContent.replace("END:VTODO", `COMPLETED:${icsNow}\nEND:VTODO`);
				}
			} else {
				modifiedContent = modifiedContent.replace(/COMPLETED:.*\n?/, "");
			}

			console.log("Modified content:", modifiedContent);
			return modifiedContent;
		}

		async function uploadVTODO(filename, fileContent) {
			try {
				await client.putFileContents("/" + filename, fileContent, { contentType: "text/calendar", overwrite: true });
				console.log("VTODO upload successful.");
				} catch (err) {
					console.error("VTODO upload failed:", err);
			}
		}
		


		(async () => {
			const fileContent = await downloadCompleteFile(filename);
			const modifiedContent = await modifyFile(fileContent);
			await uploadVTODO(filename, modifiedContent);
			
		})();

	
	},



	sendLog: function(moduleId, payload) {
		this.sendSocketNotification("MMM-NextCloud-Tasks-Helper-LOG#" + moduleId, payload);
	},

	sendError: function(moduleId, payload) {
		this.sendSocketNotification("MMM-NextCloud-Tasks-Helper-ERROR#" + moduleId, payload);
	}
});
