/*
 * MagicMirror²
 * Node Helper: MMM-CalDAV-Tasks
 *
 * By Jan Ryklikas
 * MIT Licensed.
 *
 * Wiring only: the backend schedule lives in lib/mmm-shared/backend-session.js, the work
 * in lib/task-pipeline.js (read) and lib/task-toggle.js (write).
 */

const NodeHelper = require("node_helper");
const shared = require("./lib/mmm-shared/mmm-shared");
const { fetchCalendarData } = require("./lib/webDavHelper");
const { normalizeConfig } = require("./lib/config-validator");
const { setLogger } = require("./lib/logger");
const { createInstanceHub, formatLogEntry } = require("./lib/mmm-shared/backend-session");
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
    // One logger per instance: its logLevel (from CONFIGURE) narrows the global
    // level for that instance only. Until CONFIGURE only the global level applies.
    this.loggers = new Map();
    this.logLevels = new Map();
    this.logger = this.getLogger("node_helper");
    // The lib/ modules without an instance (DAV login, write errors) log here.
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
      onConfigured: (identifier, config) => {
        this.logLevels.set(identifier, config.logLevel);
      },
      fetch: ({ identifier, config, reason }) => this.fetchTasks(identifier, config, reason),
    });

    this.hub.route("TOGGLE_TASK", async ({ identifier, config, data }) => {
      await toggleTask(config, data.filename, data.status, {
        logger: this.getLogger(identifier),
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

  getLogger(identifier) {
    if (!this.loggers.has(identifier)) {
      this.loggers.set(
        identifier,
        shared.createLogger({
          moduleName: MODULE_NAME,
          identifier,
          consoleRef: logSink,
          getLevel: () => this.logLevels.get(identifier),
          structured: true,
          redact: true,
        }),
      );
    }
    return this.loggers.get(identifier);
  },

  async fetchTasks(identifier, config, reason) {
    const logger = this.getLogger(identifier);
    const startTime = Date.now();
    logger.debug(`Fetching tasks for ${identifier} (${reason})`);

    const calendarData = await fetchCalendarData(config);
    const { calendars, taskCount } = buildTaskLists(calendarData, config);

    logger.info(
      `Fetched ${calendars.length} calendar(s), ${taskCount} task(s) for ${identifier} in ${Date.now() - startTime}ms (${reason})`,
    );
    return calendars;
  },
});
