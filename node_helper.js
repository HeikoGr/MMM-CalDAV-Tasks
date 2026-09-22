/*
 * MagicMirror²
 * Node Helper: MMM-CalDAV-Tasks
 *
 * By Jan Ryklikas
 * MIT Licensed.
 */

const NodeHelper = require("node_helper");
const shared = require("./lib/mmm-shared/mmm-shared");
const {
  transformData,
  sortList,
  appendUrlIndex,
} = require("./lib/transformer");
const {
  parseList,
  mapEmptyPriorityTo,
  mapEmptySortIndexTo,
  fetchCalendarData,
  initDAVClient,
} = require("./lib/webDavHelper");
const VTodoCompleter = require("./lib/vtodo-completer.js");
const { validateConfig } = require("./lib/config-validator");
const { setLogger } = require("./lib/logger");

module.exports = NodeHelper.create({
  // Track ongoing requests to prevent parallel updates
  pendingRequests: new Map(),

  start() {
    this.notifications = shared.buildNotifications("MMM-CalDAV-Tasks");
    this.transport = shared.createNodeTransport({
      moduleName: "MMM-CalDAV-Tasks",
      sendSocketNotification: this.sendSocketNotification.bind(this),
    });
    this.errorFactory = shared.createErrorFactory();
    this.logger = shared.createLogger({
      moduleName: "MMM-CalDAV-Tasks",
      identifier: "node_helper",
      getLevel: () => "info",
      structured: true,
      redact: true,
    });
    // Route the lib/ modules through the same logger instead of bare console.
    setLogger(this.logger);
  },

  socketNotificationReceived(notification, payload) {
    if (notification !== this.notifications.REQUEST) {
      return;
    }

    const moduleId = payload?.identifier || payload?.instanceId || "default";
    this.logger.info("request received", {
      moduleId,
      action: payload?.action,
      requestId: payload?.requestId,
    });

    if (payload?.action === "FETCH_TASKS") {
      this.getData(moduleId, payload?.data?.config, payload);
      return;
    }

    if (payload?.action === "TOGGLE_TASK") {
      this.toggleStatusViaWebDav(
        payload?.data?.config,
        payload?.data?.filename,
        payload?.data?.status,
      )
        .then(() => {
          this.transport.sendSuccess(payload, { toggled: true });
        })
        .catch((error) => {
          this.transport.sendError(
            payload,
            this.errorFactory.fromException(error, {
              code: "TOGGLE_FAILED",
              retryable: true,
              details: { moduleId },
            }),
          );
        });
    }
  },

  async getData(moduleId, config, requestEnvelope) {
    const self = this;

    // Prevent parallel requests for same module
    if (self.pendingRequests.has(moduleId)) {
      this.logger.info(
        `[MMM-CalDAV-Tasks] Skipping update for ${moduleId} - request already in progress`,
      );
      return;
    }

    self.pendingRequests.set(moduleId, true);
    const startTime = Date.now();
    this.logger.info(
      `[MMM-CalDAV-Tasks] Starting data fetch for module ${moduleId}`,
    );

    try {
      const effectiveConfig = this.normalizeConfig(config);

      const allTasks = [];
      const calendarData = await fetchCalendarData(effectiveConfig);

      // iterate over all Arrays
      for (let i = 0; i < calendarData.length; i++) {
        const icsList = calendarData[i].icsStrings;
        const rawList = parseList(icsList, effectiveConfig.dateFormat);
        const priorityList = mapEmptyPriorityTo(
          rawList,
          effectiveConfig.mapEmptyPriorityTo,
        );
        const sortIndexList = mapEmptySortIndexTo(
          priorityList,
          effectiveConfig.mapEmptySortIndexTo,
        );
        const indexedList = appendUrlIndex(sortIndexList, i);
        const sortedList = sortList(indexedList, effectiveConfig.sortMethod);
        const sortedAppleList = sortList(sortedList, "apple");
        const nestedList = transformData(sortedAppleList);
        allTasks.push(...nestedList);
        calendarData[i].tasks = nestedList;
      }

      const duration = Date.now() - startTime;
      this.logger.info(
        `Data fetch completed for module ${moduleId} in ${duration}ms - ${calendarData.length} calendar(s), ${allTasks.length} task(s)`,
      );
      this.transport.sendSuccess(requestEnvelope, calendarData);
    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.error(
        `Data fetch failed for module ${moduleId} after ${duration}ms:`,
        { message: error instanceof Error ? error.message : String(error) },
      );
      this.transport.sendError(
        requestEnvelope,
        this.errorFactory.fromException(error, {
          code: "FETCH_TASKS_FAILED",
          retryable: true,
          details: { moduleId },
        }),
      );
    } finally {
      // Always clean up pending request
      self.pendingRequests.delete(moduleId);
    }
  },

  /**
   * Validate the frontend config and merge in the schema defaults.
   *
   * Every path that talks to the server goes through this, so read and write
   * do not work off two different versions of the same config.
   * @param {Object} config - The raw config as sent by the frontend.
   * @returns {Object} The effective configuration.
   */
  normalizeConfig(config) {
    const { valid, config: normalizedConfig, errors } = validateConfig(config);

    if (!valid) {
      throw new Error(
        `Configuration error: ${errors.map((e) => e.message).join("; ")}`,
      );
    }

    return { ...config, ...normalizedConfig };
  },

  async toggleStatusViaWebDav(config, filename, status) {
    const effectiveConfig = this.normalizeConfig(config);
    const timeout = effectiveConfig.requestTimeout;
    // The frontend flips the icon optimistically and sends the state it now
    // shows, so "unchecked" has to reopen the task rather than complete it
    // a second time.
    const reopen = status === "unchecked";

    this.logger.info(
      `${reopen ? "Reopening" : "Completing"} task: ${filename}`,
    );

    try {
      const client = initDAVClient(effectiveConfig);
      const completer = new VTodoCompleter(client, { logger: this.logger });

      const operation = reopen
        ? completer.uncompleteVTodo(effectiveConfig, filename)
        : completer.completeVTodo(effectiveConfig, filename);

      // Toggle with timeout. The timer is cleared once the race is decided, so
      // a finished toggle does not keep a pending handle around for the rest of
      // the timeout.
      let timer = null;
      try {
        await Promise.race([
          operation,
          new Promise((_, reject) => {
            timer = setTimeout(
              () =>
                reject(
                  new Error(`Toggle task status timed out after ${timeout}ms`),
                ),
              timeout,
            );
          }),
        ]);
      } finally {
        clearTimeout(timer);
      }

      this.logger.info(`Successfully toggled task: ${filename}`);
    } catch (error) {
      this.logger.error("Toggle error", {
        message: error instanceof Error ? error.message : String(error),
        filename,
      });
      throw error;
    }
  },
});
