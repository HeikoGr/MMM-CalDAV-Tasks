/* global Module, Log */

/* Magic Mirror
 * Module: MMM-NextCloud-Tasks
 *
 * By Jan Ryklikas
 * MIT Licensed.
 */

Module.register("MMM-NextCloud-Tasks", {
	defaults: {
		updateInterval: 60000,
		hideCompletedTasks: null,
		sortMethod: "priority",
		colorize: false,
		startsInDays: 999999,
		displayStartDate: true,
		dueInDays: 999999,
		displayDueDate: true,
		showWithoutStart: true,
		showWithoutDue: true,
		hideCompletedTasksAfter: 1, // 1 day
		dateFormat: "DD.MM.YYYY",
		headings: [null],
		playSound: true,
		offsetTop: 0,
		offsetLeft: 0,
		toggleTime: 1600, // mseconds
		showCompletionPercent: false,
		mapEmptyPriorityTo: 5,
		developerMode: false,
		highlightStartedTasks: true,
		highlightOverdueTasks: true,
		pieChartBackgroundColor: "rgb(138, 138, 138)",
		pieChartColor: "rgb(255, 255, 255)",
		pieChartSize: 16,
		hideDateSectionOnCompletion: true
	},

	requiresVersion: "2.1.0", // Required version of MagicMirror

	toDoList: null,
	error: null,
	audio: null, // define audio to prelaod the sound

	start: function () {
		var self = this;

		//Flag for check if module is loaded
		self.loaded = false;

		// Preload the sound
		this.audio = new Audio('/modules/MMM-NextCloud-Tasks/sounds/task_finished.wav');
		this.audio.load();

		// A little fallback if the config is still of the old type
		// this is for "listUrl" which was a string before
		if (self.verifyConfig(self.config)) {
			if (self.isListUrlSingleValue(self.config.listUrl)) {
				self.error = "A little config Error in MMM-Nextcloud-Task: 'listUrl' should be an array now as the module now supports multiple urls. Example:<br>" +
					"<div class='MMM-Nextcloud-Tasks-New-Config-Note'>" +
					"<span style='color: #e34c26;'>Old:</span><br> <span style='font-family: Courier; color: lightblue;'>listUrl</span>: <span style='font-family: Courier; color: brown;'>\"https://my-nextcloud.com/remote.php/dav/calendars/cornelius/private-tasks/\"</span><span style='font-family: Courier; color: white;'>,</span><br>" +
					"<span style='color: #4caf50;'>New:</span><br> <span style='font-family: Courier; color: lightblue;'>listUrl</span>: [<span style='font-family: Courier; color: brown;'>\"https://my-nextcloud.com/remote.php/dav/calendars/cornelius/private-tasks/\"</span><span style='font-family: Courier; color: white;'>,</span>]" +
					"<span style='color: #4caf50;'><br>Example with two urls:</span><br> <span style='font-family: Courier; color: lightblue;'>listUrl</span>: [" +
					"<span style='font-family: Courier; color: brown;'>\"https://my-nextcloud.com/remote.php/dav/calendars/cornelius/private-tasks/\"</span><span style='font-family: Courier; color: white;'>,</span><br> " +
					"<span style='font-family: Courier; color: brown;'>\"https://my-nextcloud.com/remote.php/dav/calendars/cornelius/work-tasks/\"</span><span style='font-family: Courier; color: white;'></span>]," +
					"</div>";
				self.updateDom();
				return;
			}

			// this is for the old "hideCompletedTasks" boolean which now is "hideCompletedTasksAfter" with a number
			if (this.config.hideCompletedTasks !== null) {
				const infoText =
					"<span style='color:  #e34c26;'>Deprecation:</span> <span style='color: #ffffff;'>The old 'hideCompletedTasks' boolean is deprecated. Use </span>" +
					"<span style='color: #ffcc00;'>hideCompletedTasksAfter</span><span style='color: #ffffff;'> to specify the number of days after which completed tasks are hidden." +
					"Use. 0 to hide at once. Example: </span>" +
					"<br><span style='font-family: Courier; color: lightblue;'>hideCompletedTasksAfter</span>:  <span style='font-family: Courier; color: blue;'>1</span><span style='font-family: Courier; color: white;'>,</span><br></br>"
				this.error = infoText;
				self.updateDom();
				return;
			}

			// Schedule update timer.
			self.getData(this.config.mapEmptyPriorityTo); // TODO: here i get the data from

			setInterval(function () {
				self.getData();
				self.updateDom();
			}, self.config.updateInterval);
		} else {
			Log.info("config invalid");
			self.error = "config invalid";
			self.updateDom();
		}
	},

	isListUrlSingleValue: function (listUrl) {
		return typeof listUrl === "string";
	},

	/*
	 * getData
	 * function example return data and show it in the module wrapper
	 * get a URL request
	 *
	 */
	getData: function () {
		this.sendSocketNotification(
			"MMM-NextCloud-Tasks-UPDATE",
			{
				id: this.identifier,
				config: this.config
			}
		);
	},

	getDom: function () {
		let self = this;

		// Reinitialize usedUrlIndices before updating the DOM so that the headings are displayed correctly
		this.usedUrlIndices = [];

		// on my computer the Fontawesome Icons do not work without this when working under windows
		// on the raspberry pi it works without this
		if (this.config.developerMode) {
			let link = document.createElement("link");
			link.rel = "stylesheet";
			link.href = "https://cdnjs.cloudflare.com/ajax/libs/font-awesome/5.15.3/css/all.min.css";
			document.head.appendChild(link);
			document.documentElement.style.cursor = "default";
		}

		// create element wrapper for show into the module
		let wrapper = document.createElement("div");
		wrapper.className = "MMM-NextCloud-Tasks-wrapper";

		if (self.toDoList) {
			wrapper.appendChild(self.renderList(self.toDoList));
			self.error = null;
		} else {
			wrapper.innerHTML = "<div>Loading...</div>";
		}

		if (self.error) {
			wrapper.innerHTML = "<div>" + self.error + "</div>";
		}

		// Initialize long press handlers after the DOM is updated
		setTimeout(() => {
			self.initLongPressHandlers();
		}, 0);

		return wrapper;
	},

	// create list of tasks

	renderList: function (children, isTopLevel = true) {
		let self = this;
		let checked = "<span class=\"fa fa-fw fa-check-square\"></span>"
		let unchecked = "<span class=\"fa fa-fw fa-square\"></span>"

		let ul = document.createElement("ul");
		for (const element of children) {
			if (element.status === "COMPLETED") {
				if (typeof this.config.hideCompletedTasksAfter === "number" && element.completed) {
					// convert ISO 8601 string to date-objekt without moment.js
					const completedDate = new Date(element.completed);
					const daysSinceCompleted = (new Date() - completedDate) / (1000 * 60 * 60 * 24);
					if (daysSinceCompleted > this.config.hideCompletedTasksAfter) {
						continue;
					}
				}
			}

			const now = new Date();

			if (element.start) {
				const start = new Date(element.start);
				const daysUntilStart = (start - now) / (1000 * 60 * 60 * 24);
				if (daysUntilStart > self.config.startsInDays) {
					continue;
				}
			} else if (!self.config.showWithoutStart) {
				continue;
			}

			if (element.end) {
				const end = new Date(element.end);
				const daysUntilDue = (end - now) / (1000 * 60 * 60 * 24);
				if (daysUntilDue > self.config.dueInDays) {
					continue;
				}
			} else if (!self.config.showWithoutDue) {
				continue;
			}

			let icon = (element.status === "COMPLETED" ? checked : unchecked);
			let li = document.createElement("li");
			if (isTopLevel) {
				li.classList.add("MMM-NextCloud-Tasks-Toplevel");
			}
			let p = element.priority;

			if (!this.usedUrlIndices) {
				this.usedUrlIndices = [];
			}
			if (!this.usedUrlIndices.includes(element.urlIndex)) {
				this.usedUrlIndices.push(element.urlIndex);
				const headingText = this.config.headings[element.urlIndex];
				if (headingText !== null && headingText !== "null" && headingText !== undefined) {
					let h2 = document.createElement("h2");
					h2.className = "MMM-NextCloud-Tasks-Heading-" + element.urlIndex;
					h2.textContent = headingText;
					ul.appendChild(h2);
				}
			}

			let listItemClass = "MMM-NextCloud-Tasks-List-Item";
			let parentDivClass = "";
			if (element.status === "COMPLETED") {
				parentDivClass += " MMM-NextCloud-Tasks-List-Item-Completed";
			}
			if (self.config.colorize) {
				li.innerHTML = "<div class='" + listItemClass + (element.status === "COMPLETED" ? " MMM-NextCloud-Tasks-Completed" : "") + "' data-url-index='" + element.urlIndex + "' id='" + element.uid + "' vtodo-filename='" + element.filename + "'>" +
					"<span class='MMM-Nextcloud-Tasks-Priority-" + p + "'>" + icon + "</span> " + element.summary +
					(self.config.showCompletionPercent === true ? "<canvas class='MMM-Nextcloud-Tasks-CompletionCanvas'></canvas>" : "") +
					"</div>";
			} else {
				li.innerHTML = "<div class='" + listItemClass + (element.status === "COMPLETED" ? " MMM-NextCloud-Tasks-Completed" : "") + "' data-url-index='" + element.urlIndex + "' id='" + element.uid + "' vtodo-filename='" + element.filename + "'>" +
					icon + " " + element.summary +
					(self.config.showCompletionPercent === true ? "<canvas class='MMM-Nextcloud-Tasks-CompletionCanvas'></canvas>" : "") +
					"</div>";
			}

			if (self.config.showCompletionPercent === true) {
				const canvas = li.querySelector("canvas.MMM-Nextcloud-Tasks-CompletionCanvas");
				if (canvas) {
					const ctx = canvas.getContext("2d");
					const size = this.config.pieChartSize;
					canvas.width = size;
					canvas.height = size;
					const completion = Number(element.completion) || 0;
					const centerX = size / 2;
					const centerY = size / 2;
					const outerRadius = size / 2;
					const innerRadius = outerRadius - outerRadius * 0.9 / 2; // 90% of outer radius
					const startAngle = -Math.PI / 2; // start at 12 o'clock
					const endAngle = startAngle + (completion / 100) * 2 * Math.PI;

					// Draw background arc
					ctx.fillStyle = self.config.pieChartBackgroundColor;
					ctx.beginPath();
					ctx.arc(centerX, centerY, outerRadius, 0, 2 * Math.PI, false);
					ctx.arc(centerX, centerY, innerRadius, 2 * Math.PI, 0, true);
					ctx.closePath();
					ctx.fill();

					// Draw completion arc
					if (completion > 0) {
						ctx.fillStyle = self.config.pieChartColor;
						ctx.beginPath();
						ctx.arc(centerX, centerY, outerRadius, startAngle, endAngle, false);
						ctx.arc(centerX, centerY, innerRadius, endAngle, startAngle, true);
						ctx.closePath();
						ctx.fill();
					}
				}
			}

			if ((self.config.displayStartDate && element.start) || (self.config.displayDueDate && element.due)) {
				let dateSection = document.createElement("div");
				dateSection.className = "MMM-Nextcloud-Tasks-Date-Section";
				if (element.status === "COMPLETED") {
					if (self.config.hideDateSectionOnCompletion) {
						dateSection.classList.add("MMM-NextCloud-Tasks-Completed");
						dateSection.style.display = "none";
					} else {
						dateSection.classList.add("MMM-NextCloud-Tasks-Completed");
					}
				}

				if (self.config.displayStartDate && element.start) {
					let startDate = new Date(element.start);
					let spanStart = document.createElement("span");
					spanStart.textContent = " " + startDate.toLocaleDateString(undefined, self.config.dateFormat);
					if (now > startDate) {
						spanStart.className = "MMM-NextCloud-Tasks-Started";
					} else {
						spanStart.className = "MMM-NextCloud-Tasks-StartDate";
					}
					dateSection.appendChild(spanStart);
				}
				if (self.config.displayDueDate && element.dueFormatted) {
					;
					let spanDue = document.createElement("span");
					let dueDate = new Date(element.start);
					console.log("dueDate: " + element.dueFormatted);
					console.log("now: " + now);
					spanDue.textContent = " " + element.dueFormatted; //Date.toLocaleDateString(undefined, self.config.dateFormat);
					if (now > dueDate) {
						spanDue.className = "MMM-NextCloud-Tasks-Overdue";
					} else {
						spanDue.className = "MMM-NextCloud-Tasks-DueDate";
					}
					dateSection.appendChild(spanDue);
				}

				li.appendChild(dateSection);
			}

			if (typeof element.children !== "undefined") {
				let childList = self.renderList(element.children, false);
				childList.classList.add("MMM-NextCloud-Tasks-SubList");
				li.appendChild(childList);
			}
			ul.appendChild(li);
		}
		return ul;
	},

	// Animate list element when long clicking
	initLongPressHandlers: function () {
		console.debug("[MMM-Nextcloud-Tasks] ready for long press");
		const items = document.querySelectorAll(".MMM-NextCloud-Tasks-List-Item");
		console.log(items);
		items.forEach((item) => {
			let pressTimer = null;
			let startTime = 0;
			let blurInterval = null;

			const resetEffects = () => {
				clearTimeout(pressTimer);
				clearInterval(blurInterval);
				item.style.filter = "none";
				item.style.opacity = "1";
			};

			const startEffects = () => {
				toggleTime = this.config.toggleTime;
				startTime = Date.now();
				const effectSpeed = toggleTime / 50;
				blurInterval = setInterval(() => {
					const elapsed = Date.now() - startTime;
					if (elapsed >= toggleTime) {
						clearInterval(blurInterval);
						newState = toggleCheck(item);
						toggleEffectOnTimerEnd(item);
						console.debug("[MMM-Nextcloud-Tasks] new state: " + newState);
						console.debug("[MMM-Nextcloud-Tasks] item id: " + item.id);

						this.sendSocketNotification("MMM-NextCloud-Tasks-TOGGLE", {
							id: item.id,
							status: newState,
							config: this.config,
							urlIndex: item.getAttribute("data-url-index"),
							filename: item.getAttribute("vtodo-filename")
						});
						resetEffects();
					} else {
						const progress = elapsed / toggleTime;
						item.style.filter = `blur(${4 * progress}px)`;
						item.style.opacity = `${1 - progress}`;
					}
				}, effectSpeed);
			};

			const toggleEffectOnTimerEnd = (item) => {
				console.debug("[MMM-Nextcloud-Tasks] toggleEffectOnTimerEnd called");
				this.audio.play().catch(error => console.error("Error playing audio:", error));

				startTime = Date.now();
				const effecttoggleTime = 1200;
				const overlay = item.cloneNode(true);

				overlay.style.position = "absolute";
				overlay.style.top = (item.offsetTop + this.config.offsetTop) + "px";
				overlay.style.left = (item.offsetLeft + this.config.offsetLeft) + "px";
				overlay.style.color = "red";
				overlay.style.zIndex = "100000";
				overlay.style.pointerEvents = "none";
				overlay.style.filter = "none";
				overlay.style.opacity = "1";

				const styleEl = document.createElement("style");
				styleEl.innerHTML = `
				@keyframes fadeToBright {
					0% {
						color: red;
						opacity: 1;
					}
					85% {
						color: var(--color-text-bright);
					}
					100% {
						color: var(--color-text-bright);
						opacity: 0;
					}
				}
				`;
				document.head.appendChild(styleEl);

				overlay.style.animation = `fadeToBright ${effecttoggleTime}ms forwards`;
				item.parentElement.appendChild(overlay);

				item.style.transition = `filter ${effecttoggleTime}ms ease-in-out`;
				item.style.filter = "blur(10px)";
				setTimeout(() => {
					item.style.filter = "blur(0)";
				}, effecttoggleTime);

				setTimeout(() => {
					overlay.remove();
					item.style.transition = "none";
					item.style.filter = "none";
				}, effecttoggleTime + 1000);
				item.classList.toggle("MMM-NextCloud-Tasks-Completed");
				const li = item.closest("li");
				if (li) {
					const dateSection = li.querySelector(".MMM-Nextcloud-Tasks-Date-Section");
					if (dateSection) {
						if (this.config.hideDateSectionOnCompletion) {
							dateSection.style.display = dateSection.style.display === "none" ? "block" : "none";
						} else {
							dateSection.classList.toggle("MMM-NextCloud-Tasks-Completed");
						}
					}
				}

			};

			const toggleCheck = (listItem) => {
				const iconSpan = listItem.querySelector(".fa");
				if (!iconSpan) return;
				const isChecked = iconSpan.classList.contains("fa-check-square");
				iconSpan.classList.toggle("fa-check-square", !isChecked);
				iconSpan.classList.toggle("fa-square", isChecked);
				return isChecked ? "unchecked" : "checked";
			};

			const startHandler = () => {
				Log.info("touch/mouse start on item: " + item.id);
				resetEffects();
				pressTimer = setTimeout(() => { }, this.config.toggleTime);
				startEffects(item);
			};

			item.addEventListener("mousedown", startHandler);
			item.addEventListener("touchstart", startHandler, { passive: true });
			item.addEventListener("mouseup", resetEffects);
			item.addEventListener("mouseleave", resetEffects);
			item.addEventListener("touchend", resetEffects);
			item.addEventListener("touchcancel", resetEffects);
		});
	},

	getStyles: function () {
		return [
			"MMM-NextCloud-Tasks.css",
		];
	},

	socketNotificationReceived: function (notification, payload) {
		if (notification === "MMM-NextCloud-Tasks-Helper-TODOS#" + this.identifier) {
			this.toDoList = payload;
			Log.log("[MMM-NextCloud-Tasks] received payload: ", payload);
			this.updateDom();
		}
		if (notification === "MMM-NextCloud-Tasks-Helper-LOG#" + this.identifier) {
			Log.log("LOG: ", payload);
		}
		if (notification === "MMM-NextCloud-Tasks-Helper-ERROR#" + this.identifier) {
			Log.error("ERROR: ", payload);
			this.error = payload + "<br>";
			this.updateDom();
		}
	},

	verifyConfig: function (config) {
		if (
			typeof config.listUrl === "undefined" ||
			typeof config.webDavAuth === "undefined" ||
			typeof config.webDavAuth.username === "undefined" ||
			typeof config.webDavAuth.password === "undefined" ||
			typeof config.sortMethod === "undefined" ||
			typeof config.colorize === "undefined" ||
			typeof config.updateInterval === "undefined" ||
			typeof config.hideCompletedTasks === "undefined" ||
			typeof config.startsInDays === "undefined" ||
			typeof config.displayStartDate === "undefined" ||
			typeof config.dueInDays === "undefined" ||
			typeof config.displayDueDate === "undefined" ||
			typeof config.showWithoutStart === "undefined" ||
			typeof config.showWithoutDue === "undefined" ||
			typeof config.hideCompletedTasksAfter === "undefined" ||
			typeof config.dateFormat === "undefined" ||
			typeof config.headings === "undefined" ||
			typeof config.playSound === "undefined" ||
			typeof config.offsetTop === "undefined" ||
			typeof config.offsetLeft === "undefined" ||
			typeof config.toggleTime === "undefined" ||
			typeof config.showCompletionPercent === "undefined" ||
			typeof config.developerMode === "undefined" ||
			typeof config.mapEmptyPriorityTo === "undefined",
			typeof config.pieChartBackgroundColor === "undefined",
			typeof config.pieChartColor === "undefined",
			typeof config.pieChartSize === "undefined",
			typeof config.hideDateSectionOnCompletion === "undefined"
		) {
			this.error = "Config variable missing";
			Log.error("Config variable missing");
			return false;
		}
		return true;
	}
});
