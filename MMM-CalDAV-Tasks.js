
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
    // Task lists change on a scale of minutes; the one case that needs to be
    // instant is the own long-press toggle, and that renders optimistically and
    // triggers its own refresh.
    updateInterval: 10 * 60 * 1000,
    // Keep refreshing while the module is hidden (e.g. under MMM-Carousel) so
    // the displayed data is warm whenever the module becomes visible.
    backgroundRefresh: true,
    // Optional window without any polling, e.g. { from: "23:00", to: "06:00" }.
    quietHours: null,
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
    headings: [],
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
  lastSuccessfulData: null, // Keep last successful data for graceful fallback
  loadingTimeoutTimer: null, // Timer for frontend timeout detection
  lastUpdateRequest: null, // Timestamp of last update request
  lifecycle: null,
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
    this.logger = this.shared.createLogger({
      moduleName: "MMM-CalDAV-Tasks",
      identifier: this.identifier,
      getLevel: () => (this.config.developerMode ? "debug" : "info"),
      structured: false,
      redact: true,
    });

    // Flag for check if module is loaded
    self.loaded = false;

    // developerMode: show the default cursor for easier development. Set once -
    // it is a document-wide preference, not per render.
    if (self.config.developerMode) {
      document.documentElement.style.cursor = "default";
    }

    // Initialize TaskRenderer (will be loaded via getScripts())
    // Note: TaskRenderer is loaded asynchronously, so we initialize it in getDom()

    // An invalid config still gets a lifecycle so rendering and visibility keep
    // working - it just never fetches.
    const configValid = self.verifyConfig(self.config);

    this.lifecycle = this.shared.createLifecycle({
      module: this,
      logger: this.logger,
      updateInterval: this.config.updateInterval,
      minUpdateInterval: 30 * 1000,
      backgroundRefresh: this.config.backgroundRefresh !== false,
      quietHours: this.config.quietHours,
      onFetch: configValid ? () => this.getData() : null,
    });
    this.lifecycle.start();

    if (!configValid) {
      this.lifecycle.render();
    }
  },

  getScripts() {
    return [this.file("lib/mmm-shared/mmm-shared.js"), this.file("lib/task-renderer.js")];
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

      this.logger.debug("received payload", {
        calendars: payload.data?.length ?? 0,
      });
      this.lifecycle.markDataReceived();
      this.lifecycle.render();
      return;
    }

    // A completed toggle invalidates the cached list right away, independent of
    // the regular interval.
    if (
      notification === this.notifications.RESPONSE &&
      payload?.identifier === this.identifier &&
      payload?.action === "TOGGLE_TASK"
    ) {
      this.lifecycle.requestFetch("task-toggled", { force: true });
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

      if (payload?.action === "FETCH_TASKS") {
        this.lifecycle.markFetchFailed();
      }

      if (self.lastSuccessfulData) {
        Log.warn("[MMM-CalDAV-Tasks] Error occurred, keeping previous data");
        self.toDoList = self.lastSuccessfulData;
        self.error = {
          title: "Update failed",
          lines: [message],
          hint: "Showing previous data",
        };
      } else {
        self.error = { title: "Error", lines: [message] };
      }

      self.lastUpdateRequest = null;
      this.lifecycle.render();
    }
  },

  suspend() {
    this.lifecycle.suspend();
  },

  resume() {
    this.lifecycle.resume();
  },

  getData() {
    const self = this;

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
        self.error = {
          title: "Request Timeout",
          lines: [
            "No response from CalDAV server.",
            "Check your network connection and server settings.",
          ],
          hint: `Timeout after ${self.config.frontendTimeout / 1000}s`,
        };
        self.lifecycle.markFetchFailed();
        self.lifecycle.render();
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

  getDom() {
    const self = this;

    // Reinitialize usedUrlIndices before updating the DOM so that the headings are displayed correctly
    this.usedUrlIndices = [];

    // create element wrapper for show into the module
    const wrapper = document.createElement("div");
    wrapper.className = "MMM-CalDAV-Tasks-wrapper";
    wrapper.dataset.instanceId = this.instanceId || this.identifier;

    // Show error message if present (even with old data)
    if (self.error) {
      wrapper.appendChild(self.createErrorElement(self.error));
    }

    if (self.toDoList) {
      for (const element of self.toDoList) {
        wrapper.appendChild(self.renderCalendar(element));
      }
    } else if (!self.error) {
      const loading = document.createElement("div");
      loading.className = "MMM-CalDAV-Tasks-Loading";
      loading.textContent = "Loading...";
      wrapper.appendChild(loading);
    }

    return wrapper;
  },

  createErrorElement(error) {
    const errorDiv = document.createElement("div");
    errorDiv.className = "MMM-CalDAV-Tasks-error";

    const title = document.createElement("div");
    title.className = "MMM-CalDAV-Tasks-error-title";
    title.textContent = error.title;
    errorDiv.appendChild(title);

    for (const line of error.lines) {
      const lineDiv = document.createElement("div");
      lineDiv.textContent = line;
      errorDiv.appendChild(lineDiv);
    }

    if (error.hint) {
      const hint = document.createElement("div");
      hint.className = "MMM-CalDAV-Tasks-error-hint";
      hint.textContent = error.hint;
      errorDiv.appendChild(hint);
    }

    return errorDiv;
  },

  renderCalendar(calendar) {
    const calWrapper = document.createElement("div");
    calWrapper.className = "MMM-CalDAV-Tasks-Calendar-wrapper";
    if (calendar.calendarColor) {
      calWrapper.style.setProperty(
        "--calendar-color",
        calendar.calendarColor,
      );
    }

    const header = document.createElement("div");
    header.className = "MMM-CalDAV-Tasks-Calendar-Header";

    const h2 = document.createElement("h2");
    h2.textContent = calendar.summary;
    h2.className = "MMM-CalDAV-Tasks-Calendar-Heading";
    header.appendChild(h2);

    const { total, done } = TaskRenderer.countTasks(calendar.tasks, this.config);
    if (total > 0) {
      const count = document.createElement("span");
      count.className = "MMM-CalDAV-Tasks-Count";
      count.textContent = `${total - done}`;
      header.appendChild(count);
    }

    calWrapper.appendChild(header);

    if (total > 0 && done > 0) {
      const track = document.createElement("div");
      track.className = "MMM-CalDAV-Tasks-Progress";
      const bar = document.createElement("div");
      bar.className = "MMM-CalDAV-Tasks-Progress-Bar";
      bar.style.width = `${Math.round((done / total) * 100)}%`;
      track.appendChild(bar);
      calWrapper.appendChild(track);
    }

    if (total === 0) {
      const empty = document.createElement("div");
      empty.className = "MMM-CalDAV-Tasks-Empty";
      empty.textContent = "All done";
      calWrapper.appendChild(empty);
    } else {
      calWrapper.appendChild(this.renderList(calendar.tasks));
    }

    return calWrapper;
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
      li.appendChild(self.createListItem(element));

      if (element.children) {
        const childList = self.renderList(element.children, false);
        childList.classList.add("MMM-CalDAV-Tasks-SubList");
        li.appendChild(childList);
      }

      ul.appendChild(li);
    });

    return ul;
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
        const headingItem = document.createElement("li");
        headingItem.className = "MMM-CalDAV-Tasks-Heading-Item";
        const h2 = document.createElement("h2");
        h2.className = `MMM-CalDAV-Tasks-Heading-${element.urlIndex}`;
        h2.textContent = headingText;
        headingItem.appendChild(h2);
        ul.appendChild(headingItem);
      }
    }
  },

  createListItem(element) {
    const { priority, status, urlIndex, uid, filename, summary, rrule } =
      element;
    const isCompleted = status === "COMPLETED";

    const item = document.createElement("div");
    item.className = "MMM-CalDAV-Tasks-List-Item";
    if (isCompleted) {
      item.classList.add("MMM-CalDAV-Tasks-Completed");
    }
    item.dataset.urlIndex = urlIndex;
    item.dataset.uid = uid;
    item.dataset.vtodoFilename = filename;

    const iconBox = document.createElement("div");
    iconBox.className = TaskRenderer.getPriorityIconClass(
      priority,
      this.config.colorize,
    );
    iconBox.appendChild(TaskRenderer.createIcon(status));
    item.appendChild(iconBox);

    const body = document.createElement("div");
    body.className = "MMM-CalDAV-Tasks-Body";

    const summaryDiv = document.createElement("div");
    summaryDiv.className = "MMM-CalDAV-Tasks-Summary";
    summaryDiv.textContent = summary;
    if (rrule) {
      const repeat = document.createElement("span");
      repeat.className =
        "MMM-CalDAV-Tasks-RRule-Icon fa-solid fa-repeat";
      summaryDiv.appendChild(repeat);
    }
    body.appendChild(summaryDiv);
    body.appendChild(this.createDateSection(element));
    item.appendChild(body);

    if (this.config.showCompletionPercent) {
      const percentage = document.createElement("div");
      percentage.className = "MMM-CalDAV-Tasks-Percentage";
      const canvas = document.createElement("canvas");
      canvas.className = "MMM-CalDAV-Tasks-CompletionCanvas";
      TaskRenderer.drawCompletionChart(canvas, element.completion, this.config);
      percentage.appendChild(canvas);
      item.appendChild(percentage);
    }

    // Fills over toggleTime so the long press shows how long to keep holding.
    const pressProgress = document.createElement("div");
    pressProgress.className = "MMM-CalDAV-Tasks-Press-Progress";
    item.appendChild(pressProgress);

    this.bindLongPress(item);

    return item;
  },

  createDateSection(element) {
    const { status, dueFormatted, startFormatted } = element;
    const now = new Date();
    const isCompleted = status === "COMPLETED";
    const language = globalThis.config?.language;

    const section = document.createElement("div");
    section.className = "MMM-CalDAV-Tasks-Date-Section";
    if (isCompleted) {
      section.classList.add("MMM-CalDAV-Tasks-Completed");
      if (this.config.hideDateSectionOnCompletion) {
        section.style.display = "none";
      }
    }

    const start = TaskRenderer.parseISO(element.startISO);
    if (this.config.displayStartDate && start) {
      const hasStarted = now > start;
      const badge = document.createElement("span");
      badge.className = "MMM-CalDAV-Tasks-Badge MMM-CalDAV-Tasks-StartDate";
      if (hasStarted && this.config.highlightStartedTasks) {
        badge.classList.add("MMM-CalDAV-Tasks-Started");
      }
      badge.textContent = this.formatDateLabel(
        start,
        now,
        startFormatted,
        language,
        element.startDateOnly,
      );
      section.appendChild(badge);
    }

    const due = TaskRenderer.parseISO(element.dueISO);
    if (this.config.displayDueDate && due) {
      const state = TaskRenderer.getDueState(element, now);
      const badge = document.createElement("span");
      badge.className = "MMM-CalDAV-Tasks-Badge MMM-CalDAV-Tasks-DueDate";
      if (state === "overdue" && this.config.highlightOverdueTasks) {
        badge.classList.add("MMM-CalDAV-Tasks-Overdue");
      } else if (state === "today" || state === "soon") {
        badge.classList.add(`MMM-CalDAV-Tasks-Due-${state}`);
      }
      badge.textContent = this.formatDateLabel(
        due,
        now,
        dueFormatted,
        language,
        element.dueDateOnly,
      );
      section.appendChild(badge);
    }

    return section;
  },

  /*
   * Near dates read better relative ("tomorrow", "2 days ago"); anything
   * further out keeps the configured absolute format. For a task due today
   * the time of day is the useful part, so "today" gives way to it.
   */
  formatDateLabel(date, now, absolute, language, dateOnly) {
    const days = TaskRenderer.calendarDaysBetween(now, date);
    if (days === 0 && !dateOnly && absolute) {
      return absolute;
    }
    if (Math.abs(days) <= 7) {
      return TaskRenderer.formatRelative(date, now, language);
    }
    return absolute || TaskRenderer.formatRelative(date, now, language);
  },

  // Handle long press for toggling tasks
  bindLongPress(item) {
    let pressTimer = null;
    const progress = item.querySelector(".MMM-CalDAV-Tasks-Press-Progress");

    const toggleCheck = () => {
      const iconSpan = item.querySelector(".fa");
      if (!iconSpan) {
        return;
      }
      const isChecked = iconSpan.classList.contains("fa-check-square");
      iconSpan.classList.toggle("fa-check-square", !isChecked);
      iconSpan.classList.toggle("fa-square", isChecked);
      return isChecked ? "unchecked" : "checked";
    };

    const handleToggle = () => {
      const newState = toggleCheck();

      item.classList.add("MMM-CalDAV-Tasks-Toggle-Flash");
      setTimeout(() => {
        item.classList.remove("MMM-CalDAV-Tasks-Toggle-Flash");
      }, 300);

      item.classList.toggle("MMM-CalDAV-Tasks-Completed");

      // The item holds only its own date section; nested tasks keep theirs.
      const dateSection = item.querySelector(".MMM-CalDAV-Tasks-Date-Section");
      if (dateSection) {
        if (this.config.hideDateSectionOnCompletion) {
          dateSection.style.display =
            dateSection.style.display === "none" ? "" : "none";
        } else {
          dateSection.classList.toggle("MMM-CalDAV-Tasks-Completed");
        }
      }

      this.transport.sendRequest("TOGGLE_TASK", {
        id: item.dataset.uid,
        status: newState,
        config: this.config,
        urlIndex: item.dataset.urlIndex,
        filename: item.dataset.vtodoFilename,
      });
    };

    const cancelPress = () => {
      if (pressTimer) {
        clearTimeout(pressTimer);
        pressTimer = null;
      }
      item.classList.remove("MMM-CalDAV-Tasks-Pressing");
      progress.style.transition = "none";
      progress.style.transform = "scaleX(0)";
    };

    const startPress = () => {
      cancelPress();
      item.classList.add("MMM-CalDAV-Tasks-Pressing");

      // Restart the fill from zero; reading offsetWidth applies the reset
      // before the new transition starts.
      void progress.offsetWidth;
      progress.style.transition = `transform ${this.config.toggleTime}ms linear`;
      progress.style.transform = "scaleX(1)";

      pressTimer = setTimeout(() => {
        cancelPress();
        handleToggle();
      }, this.config.toggleTime);
    };

    item.addEventListener("mousedown", startPress);
    item.addEventListener("touchstart", startPress, { passive: true });
    item.addEventListener("mouseup", cancelPress);
    item.addEventListener("mouseleave", cancelPress);
    item.addEventListener("touchend", cancelPress);
    item.addEventListener("touchcancel", cancelPress);
  },

  verifyConfig(config) {
    // Frontend validation only checks required credentials.
    if (!config.webDavAuth || !config.webDavAuth.url) {
      this.error = {
        title: "Configuration Error",
        lines: [
          'Required config "webDavAuth.url" is missing.',
          "Please configure your CalDAV server URL, username and password.",
        ],
      };
      Log.error("[MMM-CalDAV-Tasks] Missing required webDavAuth configuration");
      return false;
    }

    if (!config.webDavAuth.username || !config.webDavAuth.password) {
      this.error = {
        title: "Configuration Error",
        lines: [
          "Required credentials missing in webDavAuth.",
          "Please provide username and password (use an app password!).",
        ],
      };
      Log.error("[MMM-CalDAV-Tasks] Missing webDavAuth credentials");
      return false;
    }

    return true;
  },
});
