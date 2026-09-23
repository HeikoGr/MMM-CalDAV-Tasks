/*
 * The long-press write path: complete an open task or reopen a completed one,
 * bounded by requestTimeout.
 */
const VTodoCompleter = require("./vtodo-completer.js");

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

  const controller = new AbortController();
  let operation;
  try {
    const completerOptions = { logger, signal: controller.signal };
    const completer = options.createCompleter
      ? options.createCompleter(completerOptions)
      : new VTodoCompleter(completerOptions);
    operation = reopen ? completer.uncompleteVTodo(config, filename) : completer.completeVTodo(config, filename);
  } catch (error) {
    // Never keep the task's lane blocked.
    release();
    throw error;
  }
  operation.catch(() => {}).finally(release);

  // The timer is cleared once the race is decided, so a finished toggle does
  // not keep a pending handle around for the rest of the timeout.
  let timer = null;
  let timedOut = false;
  try {
    await Promise.race([
      operation,
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          timedOut = true;
          const error = new Error(`Toggle task status timed out after ${timeout}ms`);
          // No further write may start; the one in flight cannot be recalled.
          controller.abort(error);
          reject(error);
        }, timeout);
      }),
    ]);
  } catch (error) {
    logger?.error("Toggle error", {
      message: error instanceof Error ? error.message : String(error),
      filename,
    });
    if (timedOut) {
      // The server may still apply what was already sent; refresh the list once
      // the write settles, so the display does not keep the reverted state.
      operation.catch(() => {}).finally(() => options.onLateSettle?.());
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }

  logger?.info(`Successfully toggled task: ${filename}`);
}

module.exports = { toggleTask };
