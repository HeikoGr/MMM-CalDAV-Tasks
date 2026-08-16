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
      this.toggleStatusViaWebDav(payload?.data?.config, payload?.data?.filename)
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
      // Validate and normalize configuration
      const {
        valid,
        config: normalizedConfig,
        errors,
      } = validateConfig(config);

      if (!valid) {
        const criticalErrors = errors.filter((e) => e.type !== "deprecation");
        if (criticalErrors.length > 0) {
          const errorMsg = criticalErrors.map((e) => e.message).join("; ");
          throw new Error(`Configuration error: ${errorMsg}`);
        }

        // Log deprecation warnings
        errors
          .filter((e) => e.type === "deprecation")
          .forEach((e) => this.logger.warn(e.message));
      }

      // Use normalized config with defaults
      const effectiveConfig = { ...config, ...normalizedConfig };

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

  async toggleStatusViaWebDav(config, filename) {
    const timeout = config.requestTimeout || 30000;
    this.logger.info(`Toggling task status for: ${filename}`);

    try {
      const client = initDAVClient(config);
      const completer = new VTodoCompleter(client);

      // Toggle with timeout
      await Promise.race([
        completer.completeVTodo(config, filename),
        new Promise((_, reject) =>
          setTimeout(
            () =>
              reject(
                new Error(`Toggle task status timed out after ${timeout}ms`),
              ),
            timeout,
          ),
        ),
      ]);

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
