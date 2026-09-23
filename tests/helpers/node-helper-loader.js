/**
 * Load node_helper.js outside MagicMirror.
 *
 * "node_helper" only exists inside a running MagicMirror, and the WebDAV layer
 * must not talk to a real server, so both are resolved to stubs while the
 * helper is required.
 */
const Module = require("node:module");
const path = require("node:path");

const helperPath = require.resolve("../../node_helper.js");
const webDavPath = require.resolve("../../lib/webDavHelper.js");
const stubDir = path.join(__dirname, "stubs");

/**
 * Require node_helper.js with "node_helper" and lib/webDavHelper stubbed.
 * @param {Object} webDavStub - Replacement for lib/webDavHelper.
 * @returns {Object} The node helper definition object.
 */
function loadNodeHelper(webDavStub) {
  globalThis.__mmmWebDavStub = webDavStub;

  const originalResolve = Module._resolveFilename;
  Module._resolveFilename = function (request, ...rest) {
    if (request === "node_helper") {
      return path.join(stubDir, "node_helper.js");
    }
    if (request === "./lib/webDavHelper" || request === "./webDavHelper") {
      return path.join(stubDir, "webdav.js");
    }
    return originalResolve.call(this, request, ...rest);
  };

  // A fresh copy per test, so module state cannot leak between them. The stub
  // itself is cached too and would otherwise keep serving the first test's
  // WebDAV double.
  const fresh = [
    helperPath,
    webDavPath,
    require.resolve("../../lib/vtodo-completer.js"),
    require.resolve("../../lib/task-pipeline.js"),
    require.resolve("../../lib/task-toggle.js"),
    path.join(stubDir, "webdav.js"),
    path.join(stubDir, "node_helper.js"),
  ];
  for (const cached of fresh) {
    delete require.cache[cached];
  }

  try {
    return require(helperPath);
  } finally {
    Module._resolveFilename = originalResolve;
  }
}

module.exports = { loadNodeHelper };
