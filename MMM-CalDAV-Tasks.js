/* eslint-disable no-redeclare, no-console */
/* global Module, Log, TaskRenderer */

/*
 * MagicMirror²
 * Module: MMM-CalDAV-Tasks
 *
 * By Jan Ryklikas
 * MIT Licensed.
 */

Module.register("MMM-CalDAV-Tasks", {
  defaults: {
    // required
    webDavAuth: {
      url: "https://<your-nextcloud-server>/remote.php/dav/",
      username: "<USERNAME>",
      password: "<PASSWORD>",
    },
    // optional
    includeCalendars: [],
    updateInterval: 60000,
    sortMethod: "priority",
    colorize: false,
    startsInDays: 999999,
    dueInDays: 999999,
    displayStartDate: true,
    displayDueDate: true,
    showWithoutStart: true,
    showWithoutDue: true,
    hideCompletedTasksAfter: 1, // 1 day
    dateFormat: "DD.MM.YYYY",
    headings: [null],
    toggleTime: 1000, // mseconds - long press duration
    showCompletionPercent: false,
    mapEmptyPriorityTo: 5,
    mapEmptySortIndexTo: 999999,
    highlightStartedTasks: true,
    highlightOverdueTasks: true,
    pieChartBackgroundColor: "rgb(138, 138, 138)",
    pieChartColor: "rgb(255, 255, 255)",
    pieChartSize: 16,
    hideDateSectionOnCompletion: true,
    developerMode: false,
    requestTimeout: 30000, // 30 seconds timeout for CalDAV requests
    frontendTimeout: 60000, // 60 seconds before showing timeout error in frontend
  },

  requiresVersion: "2.1.0", // Required version of MagicMirror

  toDoList: null,
  error: null,
  renderer: null, // TaskRenderer instance
  lastSuccessfulData: null, // Keep last successful data for graceful fallback
  loadingTimeoutTimer: null, // Timer for frontend timeout detection
  lastUpdateRequest: null, // Timestamp of last update request
  updateTimer: null,
  isSuspended: false,
  instanceId: null,

  start() {
    const self = this;
    self.instanceId = this.identifier;
    this.shared = globalThis.MMModuleShared;
    this.sharedContext = this.shared.createModuleContext(
      "MMM-CalDAV-Tasks",
      this.identifier,
      {
        instanceId: this.identifier,
        logLevel: "info",
        logStructured: true,
        logRedaction: true,
      },
    );
    this.transport = this.shared.createTransport({
      moduleName: "MMM-CalDAV-Tasks",
      identifier: this.identifier,
      instanceId: this.sharedContext.instanceId,
      sendSocketNotification: this.sendSocketNotification.bind(this),
    });
    this.notifications = this.transport.notifications;

    // Flag for check if module is loaded
    self.loaded = false;

    // Initialize TaskRenderer (will be loaded via getScripts())
    // Note: TaskRenderer is loaded asynchronously, so we initialize it in getDom()

    if (!self.verifyConfig(self.config)) {
      self.updateDom();
      return;
    }

    self.getData();
    self.startUpdateTimer();
  },

  getScripts() {
    return [this.file("lib/mmm-shared.js"), this.file("lib/task-renderer.js")];
  },

  getStyles() {
    return ["MMM-CalDAV-Tasks.css", "font-awesome.css"];
  },

  socketNotificationReceived(notification, payload) {
    const self = this;

    if (
      notification === this.notifications.RESPONSE &&
      payload?.identifier === this.identifier &&
      payload?.action === "FETCH_TASKS"
    ) {
      if (self.loadingTimeoutTimer) {
        clearTimeout(self.loadingTimeoutTimer);
        self.loadingTimeoutTimer = null;
      }

      self.lastSuccessfulData = payload.data;
      self.toDoList = payload.data;
      self.error = null;
      self.lastUpdateRequest = null;

      Log.log("[MMM-CalDAV-Tasks] received payload", payload);
      this.updateDom();
      return;
    }

    if (
      notification === this.notifications.ERROR &&
      payload?.identifier === this.identifier
    ) {
      if (self.loadingTimeoutTimer) {
        clearTimeout(self.loadingTimeoutTimer);
        self.loadingTimeoutTimer = null;
      }

      Log.error("ERROR", payload);
      const message = payload?.error?.message || "Request failed";

      if (self.lastSuccessfulData) {
        Log.warn("[MMM-CalDAV-Tasks] Error occurred, keeping previous data");
        self.toDoList = self.lastSuccessfulData;
        self.error = `${message}<br><span style='font-size: 0.8em; color: #888;'>Showing previous data</span>`;
      } else {
        self.error = `${message}<br>`;
      }

      self.lastUpdateRequest = null;
      this.updateDom();
    }
  },

  suspend() {
    this.isSuspended = true;
    this.clearUpdateTimer();

    if (this.loadingTimeoutTimer) {
      clearTimeout(this.loadingTimeoutTimer);
      this.loadingTimeoutTimer = null;
    }
  },

  resume() {
    this.isSuspended = false;
    this.startUpdateTimer();
    this.getData();
  },

  stop() {
    this.clearUpdateTimer();

    if (this.loadingTimeoutTimer) {
      clearTimeout(this.loadingTimeoutTimer);
      this.loadingTimeoutTimer = null;
    }
  },

  getData() {
    const self = this;

    if (self.isSuspended) {
      return;
    }

    // Clear any existing timeout
    if (self.loadingTimeoutTimer) {
      clearTimeout(self.loadingTimeoutTimer);
    }

    // Track when we sent the request
    self.lastUpdateRequest = Date.now();

    // Set frontend timeout
    self.loadingTimeoutTimer = setTimeout(() => {
      if (!self.toDoList && !self.lastSuccessfulData) {
        // First load failed
        self.error =
          "<strong>Request Timeout:</strong><br>" +
          "No response from CalDAV server.<br>" +
          "Check your network connection and server settings.<br>" +
          `<span style='font-size: 0.8em; color: #888;'>Timeout after ${self.config.frontendTimeout / 1000}s</span>`;
        self.updateDom();
        Log.error(
          `[MMM-CalDAV-Tasks] Frontend timeout - no response after ${self.config.frontendTimeout}ms`,
        );
      } else if (
        self.lastUpdateRequest &&
        Date.now() - self.lastUpdateRequest >= self.config.frontendTimeout
      ) {
        // Update failed, but we have old data
        Log.warn(`[MMM-CalDAV-Tasks] Update timeout - keeping previous data`);
        // Keep showing old data, don't set error
      }
    }, self.config.frontendTimeout);

    this.transport.sendRequest("FETCH_TASKS", {
      config: this.config,
    });
  },

  startUpdateTimer() {
    if (this.updateTimer || this.isSuspended) {
      return;
    }

    this.updateTimer = setInterval(() => {
      if (this.isSuspended) {
        return;
      }
      this.getData();
      this.updateDom();
    }, this.config.updateInterval);
  },

  clearUpdateTimer() {
    if (!this.updateTimer) {
      return;
    }

    clearInterval(this.updateTimer);
    this.updateTimer = null;
  },

  getDom() {
    const self = this;

    // Reinitialize usedUrlIndices before updating the DOM so that the headings are displayed correctly
    this.usedUrlIndices = [];

    /*
     * developerMode: show default cursor for easier development
     * FontAwesome is already provided by MagicMirror²
     */
    if (this.config.developerMode) {
      document.documentElement.style.cursor = "default";
    }

    // create element wrapper for show into the module
    const wrapper = document.createElement("div");
    wrapper.className = "MMM-CalDAV-Tasks-wrapper";
    wrapper.dataset.instanceId = this.instanceId || this.identifier;

    // Show error message if present (even with old data)
    if (self.error) {
      const errorDiv = document.createElement("div");
      errorDiv.className = "MMM-CalDAV-Tasks-error";
      errorDiv.innerHTML = self.error;
      wrapper.appendChild(errorDiv);
    }

    if (self.toDoList) {
      for (const element of self.toDoList) {
        const calWrapper = document.createElement("div");
        calWrapper.className = "MMM-CalDAV-Tasks-Calendar-wrapper";
        const h2 = document.createElement("h2");
        h2.textContent = element.summary;
        h2.className = "MMM-CalDAV-Tasks-Calendar-Heading";
        h2.style.color = element.calendarColor;
        calWrapper.appendChild(h2);
        calWrapper.appendChild(self.renderList(element.tasks));
        wrapper.appendChild(calWrapper);
      }
    } else if (!self.error) {
      // Only show loading if we don't have an error message
      wrapper.innerHTML = "<div>Loading...</div>";
    }

    // Initialize long press handlers after the DOM is updated
    setTimeout(() => {
      self.initLongPressHandlers(wrapper);
    }, 0);

    return wrapper;
  },

  // create list of tasks

  renderList(children, isTopLevel = true) {
    const self = this;
    const ul = document.createElement("ul");

    children.forEach((element) => {
      // Use TaskRenderer to check visibility
      if (TaskRenderer.shouldHideElement(element, self.config)) {
        return;
      }

      const li = document.createElement("li");
      if (isTopLevel) {
        li.classList.add("MMM-CalDAV-Tasks-Toplevel");
      }

      self.addHeadingIfNeeded(ul, element);

      const listItemClass = "MMM-CalDAV-Tasks-List-Item";
      const icon = TaskRenderer.getIconHTML(element.status);

      li.innerHTML = self.createListItemHTML(element, listItemClass, icon);

      if (self.config.showCompletionPercent === true) {
        self.drawCompletionCanvas(li, element);
      }

      if (element.children) {
        const childList = self.renderList(element.children, false);
        childList.classList.add("MMM-CalDAV-Tasks-SubList");
        li.appendChild(childList);
      }

      ul.appendChild(li);
    });

    return ul;
  },

  shouldHideElement(element) {
    const now = new Date();

    if (
      element.status === "COMPLETED" &&
      this.config.hideCompletedTasksAfter !== null
    ) {
      const completedDate = new Date(element.completed);
      const daysSinceCompleted = (now - completedDate) / (1000 * 60 * 60 * 24);
      if (daysSinceCompleted > this.config.hideCompletedTasksAfter) {
        return true;
      }
    }

    if (element.start) {
      const start = new Date(element.start);
      const daysUntilStart = (start - now) / (1000 * 60 * 60 * 24);
      if (daysUntilStart > this.config.startsInDays) {
        return true;
      }
    } else if (!this.config.showWithoutStart) {
      return true;
    }

    if (element.end) {
      const end = new Date(element.end);
      const daysUntilDue = (end - now) / (1000 * 60 * 60 * 24);
      if (daysUntilDue > this.config.dueInDays) {
        return true;
      }
    } else if (!this.config.showWithoutDue) {
      return true;
    }

    return false;
  },

  addHeadingIfNeeded(ul, element) {
    if (!this.usedUrlIndices) {
      this.usedUrlIndices = [];
    }
    if (!this.usedUrlIndices.includes(element.urlIndex)) {
      this.usedUrlIndices.push(element.urlIndex);
      const headingText = this.config.headings[element.urlIndex];
      if (
        headingText !== null &&
        headingText !== "null" &&
        headingText !== undefined
      ) {
        const h2 = document.createElement("h2");
        h2.className = `MMM-CalDAV-Tasks-Heading-${element.urlIndex}`;
        h2.textContent = headingText;
        ul.appendChild(h2);
      }
    }
  },

  createListItemHTML(element, listItemClass, icon) {
    const {
      priority,
      status,
      urlIndex,
      uid,
      filename,
      summary,
      rrule,
      start,
      dueFormatted,
    } = element;
    const isCompleted = status === "COMPLETED";
    const now = new Date();

    let html = `<div class='${listItemClass}${isCompleted ? " MMM-CalDAV-Tasks-Completed" : ""
      }' data-url-index='${urlIndex}' id='${uid}' vtodo-filename='${filename}'>`;

    // icon and VTODO text (summary)
    const priorityIconClass = TaskRenderer.getPriorityIconClass(
      priority,
      this.config.colorize,
    );

    html += `<div class="${priorityIconClass}">${icon}</div>`;
    html += `<div class='MMM-CalDAV-Tasks-Summary'>${summary}</div>`;

    // percentage
    html += "<div class='MMM-CalDAV-Tasks-Percentage'>";
    if (this.config.showCompletionPercent) {
      html += "<canvas class='MMM-CalDAV-Tasks-CompletionCanvas'></canvas>";
    }
    html += "</div>";

    // rrule-icon
    if (rrule) {
      html +=
        '<div class="MMM-CalDAV-Tasks-RRule-Icon fa-solid fa-repeat"></div>';
    } else {
      html += '<div class="MMM-CalDAV-Tasks-RRule-Icon">&nbsp;</div>';
    }

    // date section
    if (
      (this.config.displayStartDate && start) ||
      (this.config.displayDueDate && dueFormatted)
    ) {
      const dateClass = `MMM-CalDAV-Tasks-Date-Section${isCompleted ? " MMM-CalDAV-Tasks-Completed" : ""
        }`;
      const dateStyle =
        isCompleted && this.config.hideDateSectionOnCompletion
          ? ' style="display:none;"'
          : "";

      html += `<div class="${dateClass}"${dateStyle}>`;

      if (this.config.displayStartDate && start) {
        const startDate = new Date(start);
        const startClass =
          now > startDate
            ? "MMM-CalDAV-Tasks-Started"
            : "MMM-CalDAV-Tasks-StartDate";
        html += `<span class="${startClass}"> ${startDate.toLocaleDateString(undefined, this.config.dateFormat)}</span>`;
      }

      if (this.config.displayDueDate && dueFormatted) {
        const dueClass =
          now > new Date(dueFormatted)
            ? "MMM-CalDAV-Tasks-Overdue"
            : "MMM-CalDAV-Tasks-DueDate";
        html += `<span class="${dueClass}"> ${dueFormatted}</span>`;
      }

      html += "</div>";
    } else {
      html += '<div class="MMM-CalDAV-Tasks-Date-Section"></div>';
    }

    html += "</div>";
    return html;
  },

  drawCompletionCanvas(li, element) {
    const canvas = li.querySelector("canvas.MMM-CalDAV-Tasks-CompletionCanvas");
    if (canvas) {
      TaskRenderer.drawCompletionChart(canvas, element.completion, this.config);
    }
  },

  createDateSection(element) {
    const { status, start, dueFormatted } = element;
    const now = new Date();
    const isCompleted = status === "COMPLETED";

    const baseClass = `MMM-CalDAV-Tasks-Date-Section${isCompleted ? " MMM-CalDAV-Tasks-Completed" : ""
      }`;
    const displayStyle =
      isCompleted && this.config.hideDateSectionOnCompletion
        ? ' style="display:none;"'
        : "";

    let html = `<div class="${baseClass}"${displayStyle}>`;

    // add start date
    if (this.config.displayStartDate && start) {
      const startDate = new Date(start);
      const startClass =
        now > startDate
          ? "MMM-CalDAV-Tasks-Started"
          : "MMM-CalDAV-Tasks-StartDate";
      html += `<span class="${startClass}"> ${startDate.toLocaleDateString(undefined, this.config.dateFormat)}</span>`;
    }

    // add due date
    if (this.config.displayDueDate && dueFormatted) {
      const dueClass =
        now > new Date(dueFormatted)
          ? "MMM-CalDAV-Tasks-Overdue"
          : "MMM-CalDAV-Tasks-DueDate";
      html += `<span class="${dueClass}"> ${dueFormatted}</span>`;
    }

    html += "</div>";
    return html;
  },

  // Handle long press for toggling tasks
  initLongPressHandlers(rootElement) {
    console.debug("[MMM-CalDAV-Tasks] ready for long press");
    const items =
      rootElement?.querySelectorAll(".MMM-CalDAV-Tasks-List-Item") || [];

    items.forEach((item) => {
      if (item.dataset.longPressBound === "true") {
        return;
      }

      item.dataset.longPressBound = "true";
      let pressTimer = null;

      const toggleCheck = (listItem) => {
        const iconSpan = listItem.querySelector(".fa");
        if (!iconSpan) {
          return;
        }
        const isChecked = iconSpan.classList.contains("fa-check-square");
        iconSpan.classList.toggle("fa-check-square", !isChecked);
        iconSpan.classList.toggle("fa-square", isChecked);
        return isChecked ? "unchecked" : "checked";
      };

      const handleToggle = () => {
        const newState = toggleCheck(item);
        console.debug(
          `[MMM-CalDAV-Tasks] new state: ${newState}, item id: ${item.id}`,
        );

        // Simple visual feedback
        item.classList.add("MMM-CalDAV-Tasks-Toggle-Flash");
        setTimeout(() => {
          item.classList.remove("MMM-CalDAV-Tasks-Toggle-Flash");
        }, 300);

        // Toggle completed state
        item.classList.toggle("MMM-CalDAV-Tasks-Completed");

        // Handle date section visibility
        const li = item.closest("li");
        if (li) {
          const dateSection = li.querySelector(
            ".MMM-CalDAV-Tasks-Date-Section",
          );
          if (dateSection) {
            if (this.config.hideDateSectionOnCompletion) {
              dateSection.style.display =
                dateSection.style.display === "none" ? "block" : "none";
            } else {
              dateSection.classList.toggle("MMM-CalDAV-Tasks-Completed");
            }
          }
        }

        this.transport.sendRequest("TOGGLE_TASK", {
          id: item.id,
          status: newState,
          config: this.config,
          urlIndex: item.getAttribute("data-url-index"),
          filename: item.getAttribute("vtodo-filename"),
        });
      };

      const cancelPress = () => {
        if (pressTimer) {
          clearTimeout(pressTimer);
          pressTimer = null;
        }
        item.classList.remove("MMM-CalDAV-Tasks-Pressing");
      };

      const startPress = () => {
        Log.info(`touch/mouse start on item: ${item.id}`);
        cancelPress();

        // Add pressing state for visual feedback
        item.classList.add("MMM-CalDAV-Tasks-Pressing");

        // Set timer for long press
        pressTimer = setTimeout(() => {
          item.classList.remove("MMM-CalDAV-Tasks-Pressing");
          handleToggle();
        }, this.config.toggleTime);
      };

      item.addEventListener("mousedown", startPress);
      item.addEventListener("touchstart", startPress, { passive: true });
      item.addEventListener("mouseup", cancelPress);
      item.addEventListener("mouseleave", cancelPress);
      item.addEventListener("touchend", cancelPress);
      item.addEventListener("touchcancel", cancelPress);
    });
  },

  verifyConfig(config) {
    // Frontend validation only checks required credentials.
    if (!config.webDavAuth || !config.webDavAuth.url) {
      this.error =
        "<strong>Configuration Error:</strong><ul>" +
        '<li>Required config "webDavAuth.url" is missing.</li>' +
        "<li>Please configure your CalDAV server URL, username and password.</li>" +
        "</ul>";
      Log.error("[MMM-CalDAV-Tasks] Missing required webDavAuth configuration");
      return false;
    }

    if (!config.webDavAuth.username || !config.webDavAuth.password) {
      this.error =
        "<strong>Configuration Error:</strong><ul>" +
        "<li>Required credentials missing in webDavAuth.</li>" +
        "<li>Please provide username and password (use an app password!).</li>" +
        "</ul>";
      Log.error("[MMM-CalDAV-Tasks] Missing webDavAuth credentials");
      return false;
    }

    return true;
  },
});
