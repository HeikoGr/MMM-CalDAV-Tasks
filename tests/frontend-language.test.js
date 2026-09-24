const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "..", "MMM-CalDAV-Tasks.js"), "utf8");

/**
 * Load the frontend the way the browser does: MagicMirror declares its config
 * with a top-level `let`, which every script sees but globalThis does not carry.
 */
function loadFrontend(configScript) {
  let definition = null;
  const context = vm.createContext({
    Module: {
      register(_name, moduleDefinition) {
        definition = moduleDefinition;
      },
    },
  });
  vm.runInContext(configScript, context);
  vm.runInContext(source, context);
  return { definition, context };
}

test("the language comes from MagicMirror's global config, which is not a globalThis property", () => {
  const { definition, context } = loadFrontend('let config = { language: "de" };');

  assert.equal(context.config, undefined, "precondition: config must not be reachable via globalThis");
  assert.equal(definition.getLanguage(), "de");
});

test("without a MagicMirror config the language stays unset (the renderer falls back to English)", () => {
  const { definition } = loadFrontend("");

  assert.equal(definition.getLanguage(), undefined);
});
