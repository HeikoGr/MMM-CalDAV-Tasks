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
    completedTaskGracePeriod: 60, // seconds a just-completed task stays before it is hidden
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

  toDoList: null,
  error: null,
  loadingTimeoutTimer: null, // Timer for frontend timeout detection
  hideTimer: null, // Redraw when a completed task's grace period ends
  lifecycle: null,
  configValid: false,

  start() {
    this.shared = globalThis.MMModuleShared;
    this.transport = this.shared.createTransport({
      moduleName: "MMM-CalDAV-Tasks",
      identifier: this.identifier,
      sendSocketNotification: this.sendSocketNotification.bind(this),
    });
    this.notifications = this.transport.notifications;
    this.logger = this.shared.createLogger({
      moduleName: "MMM-CalDAV-Tasks",
      identifier: this.identifier,
      // Writes through MagicMirror's Log (global logLevel); the module's own
      // logLevel can only narrow it.
      getLevel: () => this.config.logLevel,
      structured: false,
      redact: true,
    });

    // developerMode: show the default cursor for easier development. Set once -
    // it is a document-wide preference, not per render.
    if (this.config.developerMode) {
      document.documentElement.style.cursor = "default";
    }

    // An invalid config still gets a lifecycle so rendering and visibility keep
    // working - it just never configures the backend.
    this.configValid = this.verifyConfig(this.config);
    if (this.configValid) {
      this.sendConfigure();
    }

    /*
     * The backend owns the fetch schedule (node_helper + lib/mmm-shared/backend-session.js).
     * The lifecycle here only gates rendering while hidden and reports
     * active/paused, which matters for backgroundRefresh: false.
     */
    this.lifecycle = this.shared.createLifecycle({
      module: this,
      logger: this.logger,
      updateInterval: 0,
      backgroundRefresh: this.config.backgroundRefresh !== false,
      onSessionState: ({ state }) => {
        if (this.configValid) {
          this.transport.sendRequest("SESSION_STATE", { state });
        }
      },
    });
    this.lifecycle.start();

    if (!this.configValid) {
      this.lifecycle.render();
    }
  },

  getScripts() {
    return [
      this.file("lib/mmm-shared/mmm-shared.js"),
      this.file("lib/task-renderer.js"),
      this.file("lib/long-press.js"),
    ];
  },

  getTranslations() {
    return {
      de: "translations/de.json",
      en: "translations/en.json",
    };
  },

  getStyles() {
    return ["MMM-CalDAV-Tasks.css", "font-awesome.css"];
  },

  /**
   * Send the config to the backend - once at start, again only when the
   * backend asks for it (INIT_REQUIRED, e.g. after a server restart).
   */
  sendConfigure() {
    if (!this.loadingTimeoutTimer && !this.toDoList) {
      this.loadingTimeoutTimer = setTimeout(() => {
        this.loadingTimeoutTimer = null;
        if (this.toDoList) {
          return;
        }
        this.error = {
          title: this.translate("REQUEST_TIMEOUT"),
          lines: [this.translate("TIMEOUT_NO_RESPONSE"), this.translate("TIMEOUT_CHECK_CONNECTION")],
          hint: this.translate("TIMEOUT_AFTER", { seconds: this.config.frontendTimeout / 1000 }),
        };
        this.lifecycle.render();
        this.logger.error(`Frontend timeout - no response after ${this.config.frontendTimeout}ms`);
      }, this.config.frontendTimeout);
    }

    this.transport.sendRequest("CONFIGURE", { config: this.config });
  },

  clearLoadingTimeout() {
    if (this.loadingTimeoutTimer) {
      clearTimeout(this.loadingTimeoutTimer);
      this.loadingTimeoutTimer = null;
    }
  },

  // A failed refresh keeps the last task list on screen (re-rendering it also reverts an optimistic toggle).
  showError(title, message) {
    if (this.toDoList) {
      this.error = { title, lines: [message], hint: this.translate("SHOWING_PREVIOUS_DATA") };
    } else {
      this.error = { title: this.translate("ERROR"), lines: [message] };
    }
    this.lifecycle.render();
  },

  socketNotificationReceived(notification, payload) {
    const own = payload?.identifier === this.identifier;

    if (notification === this.notifications.EVENT) {
      if (payload?.action === "INIT_REQUIRED") {
        if ((own || payload?.identifier === "*") && this.configValid) {
          this.sendConfigure();
          // A restarted backend has lost the paused state too.
          this.lifecycle.reportSessionState("init-required");
        }
        return;
      }
      if (!own) {
        return;
      }

      switch (payload.action) {
        case "DATA":
          this.clearLoadingTimeout();
          this.toDoList = payload.data;
          this.error = null;
          this.logger.debug("received payload", {
            calendars: payload.data?.length ?? 0,
          });
          this.lifecycle.markDataReceived();
          this.lifecycle.render();
          break;
        case "FETCH_FAILED":
          this.clearLoadingTimeout();
          this.logger.warn("Update failed", payload.error);
          this.showError(this.translate("UPDATE_FAILED"), payload?.error?.message || this.translate("REQUEST_FAILED"));
          break;
        case "CONFIG_INVALID":
        case "CONFIG_REJECTED":
          this.clearLoadingTimeout();
          this.error = {
            title: this.translate("CONFIG_ERROR"),
            lines: [
              payload?.error?.message ||
                this.translate("CONFIG_DIFFERS", { keys: (payload?.data?.mismatchKeys || []).join(", ") }),
            ],
          };
          this.lifecycle.render();
          break;
        default:
          break;
      }
      return;
    }

    // A failed toggle: show the notice and re-render from the last data, which
    // also reverts the optimistic icon. A successful one needs nothing here -
    // the backend fetches right away and pushes the new list.
    if (notification === this.notifications.ERROR && own && payload?.action === "TOGGLE_TASK") {
      this.logger.error("Toggle failed", payload.error);
      this.showError(this.translate("UPDATE_FAILED"), payload?.error?.message || this.translate("REQUEST_FAILED"));
    }
  },

  suspend() {
    this.lifecycle.suspend();
  },

  resume() {
    this.lifecycle.resume();
  },

  // Redraw once the next just-completed task has run out its grace period.
  scheduleHideTimer() {
    clearTimeout(this.hideTimer);
    const next = TaskRenderer.nextHideAt(this.toDoList);
    if (next !== null) {
      this.hideTimer = setTimeout(() => this.lifecycle.render(), Math.max(0, next - Date.now()) + 50);
    }
  },

  // MagicMirror's config is a global `let` in the browser, not a window property -
  // globalThis.config is undefined there, which left every relative date in English.
  getLanguage() {
    return typeof config === "object" && config ? config.language : undefined;
  },

  getDom() {
    this.scheduleHideTimer();
    // All DOM building lives in lib/task-renderer.js, the long press in
    // lib/long-press.js; the module only supplies state and the toggle action.
    return TaskRenderer.renderModule({
      toDoList: this.toDoList,
      error: this.error,
      config: this.config,
      identifier: this.identifier,
      language: this.getLanguage(),
      translate: (key) => this.translate(key),
      bindItem: (item) =>
        window.CalDavTasksLongPress.bindLongPress(item, {
          toggleTime: this.config.toggleTime,
          hideDateSectionOnCompletion: this.config.hideDateSectionOnCompletion,
          onToggle: ({ filename, status }) => this.transport.sendRequest("TOGGLE_TASK", { filename, status }),
        }),
    });
  },

  verifyConfig(config) {
    // Frontend validation only checks required credentials.
    if (!config.webDavAuth?.url) {
      this.error = {
        title: this.translate("CONFIG_ERROR"),
        lines: [this.translate("CONFIG_URL_MISSING"), this.translate("CONFIG_URL_HINT")],
      };
      this.logger.error("Missing required webDavAuth configuration");
      return false;
    }

    if (!config.webDavAuth.username || !config.webDavAuth.password) {
      this.error = {
        title: this.translate("CONFIG_ERROR"),
        lines: [this.translate("CONFIG_CREDENTIALS_MISSING"), this.translate("CONFIG_CREDENTIALS_HINT")],
      };
      this.logger.error("Missing webDavAuth credentials");
      return false;
    }

    return true;
  },
});
