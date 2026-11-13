/*
 * The long-press write path: complete an open task or reopen a completed one,
 * bounded by requestTimeout.
 */
const VTodoCompleter = require("./vtodo-completer.js");
const { withTimeout } = require("./with-timeout");

/** filename -> promise that resolves once every queued write for it finished */
const queues = new Map();

/**
 * Toggles of one task run one after another: a second long press waits until
 * the first write really finished (even one that already timed out), instead
 * of reading and writing the same object at the same time. The slot is taken
 * synchronously, so two toggles arriving together cannot both see a free lane.
 * @returns {{ previous: Promise|undefined, release: Function }} Wait for
 *   `previous`, call `release` once this toggle's write settled.
 */
function takeSlot(filename) {
  const previous = queues.get(filename);
  let release;
  const slot = new Promise((resolve) => {
    release = resolve;
  });
  const chained = (previous || Promise.resolve()).then(() => slot);
  queues.set(filename, chained);
  chained.then(() => {
    if (queues.get(filename) === chained) {
      queues.delete(filename);
    }
  });
  return { previous, release };
}

/**
 * @param {Object} config - Effective module configuration
 * @param {string} filename - Object URL of the task
 * @param {string} status - The state the frontend now shows ("checked"/"unchecked")
 * @param {Object} [options] - { logger, createCompleter, onLateSettle }
 * @param {Function} [options.createCompleter] - (completerOptions) => completer, for tests
 * @param {Function} [options.onLateSettle] - Called when a write that already timed
 *   out finishes after all, so the caller can refresh what the display shows
 * @returns {Promise<void>} Resolves once the write is done
 */
async function toggleTask(config, filename, status, options = {}) {
  const logger = options.logger;
  const timeout = config.requestTimeout;
  // The frontend flips the icon optimistically and sends the state it now
  // shows, so "unchecked" has to reopen the task rather than complete it a
  // second time.
  const reopen = status === "unchecked";

  const { previous, release } = takeSlot(filename);
  if (previous) {
    await previous;
  }
  logger?.info(`${reopen ? "Reopening" : "Completing"} task: ${filename}`);

  let operation;
  try {
    // The signal fires on timeout: no further write may start, the one in flight cannot be recalled.
    await withTimeout(
      (signal) => {
        const completerOptions = { logger, signal };
        const completer = options.createCompleter
          ? options.createCompleter(completerOptions)
          : new VTodoCompleter(completerOptions);
        operation = reopen ? completer.uncompleteVTodo(config, filename) : completer.completeVTodo(config, filename);
        operation.catch(() => {}).finally(release);
        return operation;
      },
      timeout,
      "Toggle task status",
    );
  } catch (error) {
    if (!operation) {
      // The completer could not even start; never keep the task's lane blocked.
      release();
    }
    logger?.error("Toggle error", {
      message: error instanceof Error ? error.message : String(error),
      filename,
    });
    if (error?.code === "ETIMEDOUT") {
      // The server may still apply what was already sent; refresh the list once
      // the write settles, so the display does not keep the reverted state.
      operation.catch(() => {}).finally(() => options.onLateSettle?.());
    }
    throw error;
  }

  logger?.info(`Successfully toggled task: ${filename}`);
}

module.exports = { toggleTask };
