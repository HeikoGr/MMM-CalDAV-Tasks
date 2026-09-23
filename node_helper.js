/*
 * MagicMirror²
 * Node Helper: MMM-CalDAV-Tasks
 *
 * By Jan Ryklikas
 * MIT Licensed.
 *
 * Wiring only: the backend schedule lives in lib/backend-session.js, the work
 * in lib/task-pipeline.js (read) and lib/task-toggle.js (write).
 */

const NodeHelper = require("node_helper");
const shared = require("./lib/mmm-shared/mmm-shared");
const { fetchCalendarData } = require("./lib/webDavHelper");
const { normalizeConfig } = require("./lib/config-validator");
const { setLogger } = require("./lib/logger");
const { createInstanceHub, formatLogEntry } = require("./lib/backend-session");
const { buildTaskLists } = require("./lib/task-pipeline");
const { toggleTask } = require("./lib/task-toggle");

const MODULE_NAME = "MMM-CalDAV-Tasks";

// MagicMirror's logger carries the global logLevel; outside MagicMirror (tests) console.
const Log = (() => {
  try {
    return require("logger");
  } catch {
    return console;
  }
})();

// One line per entry. Defined in this file on purpose: MagicMirror tags each line
// with the folder of the file that calls Log, so it reads [MMM-...], not [mmm-shared].
const logSink = Object.fromEntries(
  ["debug", "info", "warn", "error"].map((method) => [method, (entry) => Log[method](formatLogEntry(entry))]),
);

// Two displays of one instance must talk to the same account.
const CRITICAL_CONFIG_KEYS = Object.freeze(["webDavAuth"]);

module.exports = NodeHelper.create({
  start() {
    // The module's own logLevel arrives with CONFIGURE; until then only the
    // global level applies ("debug" = no extra filter).
    this.logLevel = undefined;
    this.logger = shared.createLogger({
      moduleName: MODULE_NAME,
      identifier: "node_helper",
      consoleRef: logSink,
      getLevel: () => this.logLevel || "debug",
      structured: true,
      redact: true,
    });
    // Route the lib/ modules through the same logger instead of bare console.
    setLogger(this.logger);

    /*
     * The frontend sends its config once (CONFIGURE) and reports whether it is
     * visible (SESSION_STATE). The hub keeps one backend schedule per instance
     * and pushes the task lists as DATA events.
     */
    this.hub = createInstanceHub({
      moduleName: MODULE_NAME,
      sendSocketNotification: this.sendSocketNotification.bind(this),
      logger: this.logger,
      criticalKeys: CRITICAL_CONFIG_KEYS,
      prepareConfig: normalizeConfig,
      lifecycleOptions: (config) => ({
        updateInterval: config.updateInterval,
        minUpdateInterval: 30 * 1000,
        backgroundRefresh: config.backgroundRefresh !== false,
        quietHours: config.quietHours,
      }),
      onConfigured: (_identifier, config) => {
        this.logLevel = config.logLevel;
      },
      fetch: ({ identifier, config, reason }) => this.fetchTasks(identifier, config, reason),
    });

    this.hub.route("TOGGLE_TASK", async ({ identifier, config, data }) => {
      await toggleTask(config, data.filename, data.status, {
        logger: this.logger,
        onLateSettle: () => this.hub.fetchNow(identifier, "task-toggled-late"),
      });
      // The list changed on the server; do not wait for the next interval.
      this.hub.fetchNow(identifier, "task-toggled");
      return { toggled: true };
    });

    this.hub.attach(this.io);
  },

  stop() {
    this.hub?.stop();
  },

  socketNotificationReceived(notification, payload) {
    this.hub.socketNotificationReceived(notification, payload);
  },

  async fetchTasks(identifier, config, reason) {
    const startTime = Date.now();
    this.logger.debug(`Fetching tasks for ${identifier} (${reason})`);

    const calendarData = await fetchCalendarData(config);
    const { calendars, taskCount } = buildTaskLists(calendarData, config);

    this.logger.info(
      `Fetched ${calendars.length} calendar(s), ${taskCount} task(s) for ${identifier} in ${Date.now() - startTime}ms (${reason})`,
    );
    return calendars;
  },
});
