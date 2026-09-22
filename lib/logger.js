/*
 * The lib/ modules are plain functions and classes without access to the
 * node_helper instance, but their output has to go through the shared logger
 * (level filtering and password redaction) instead of bare console calls.
 * A single process-wide sink is enough here: unlike the DAV client it holds no
 * per-account state, so instances cannot mix anything up by sharing it.
 */

const noopLogger = {
  debug() {},
  info() {},
  warn() {},
  error() {},
};

let sink = noopLogger;

/**
 * Point the lib logger at a shared logger instance.
 * @param {Object|null} logger - Logger with debug/info/warn/error, or null to mute.
 */
function setLogger(logger) {
  sink = logger || noopLogger;
}

const log = {
  debug: (message, context) => sink.debug(message, context),
  info: (message, context) => sink.info(message, context),
  warn: (message, context) => sink.warn(message, context),
  error: (message, context) => sink.error(message, context),
};

module.exports = { setLogger, log, noopLogger };
