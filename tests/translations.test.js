const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const { installFakeDocument } = require("./helpers/fake-dom");
const TaskRenderer = require("../lib/task-renderer");

const root = path.join(__dirname, "..");
const en = require("../translations/en.json");
const de = require("../translations/de.json");
const sources = ["MMM-CalDAV-Tasks.js", "lib/task-renderer.js"].map((file) =>
  fs.readFileSync(path.join(root, file), "utf8"),
);

/** The English texts the audit found hard-coded (CT-QUAL-01). */
const ENGLISH_TEXTS = [
  "Loading",
  "All done",
  "Request Timeout",
  "Update failed",
  "Request failed",
  "Showing previous data",
  "Configuration Error",
  "Config differs",
  "No response",
  "Required",
  "Please",
];

/** MagicMirror's Module.translate(): the language file, then English, then the key; {name} placeholders. */
function translatorFor(table) {
  return (key, variables = {}) =>
    (table[key] ?? en[key] ?? key).replace(/\{([^}]+)\}/g, (match, name) =>
      name in variables ? variables[name] : match,
    );
}

function usedKeys() {
  const keys = new Set();
  for (const source of sources) {
    for (const [, key] of source.matchAll(/translate\("([A-Z_]+)"/g)) keys.add(key);
  }
  for (const key of Object.keys(TaskRenderer.FALLBACK_TEXTS)) keys.add(key);
  return keys;
}

test("en and de carry the same keys, every key in use exists and none is unused", () => {
  assert.deepEqual(Object.keys(de).sort(), Object.keys(en).sort());
  assert.deepEqual([...usedKeys()].sort(), Object.keys(en).sort());
  for (const [key, text] of Object.entries(TaskRenderer.FALLBACK_TEXTS)) {
    assert.equal(en[key], text, `the renderer fallback for ${key} matches en.json`);
  }
});

/** A module instance as MagicMirror builds it, with language "de" and timers under test control. */
function germanModule(overrides = {}) {
  const source = fs.readFileSync(path.join(root, "MMM-CalDAV-Tasks.js"), "utf8");
  const timers = [];
  let definition = null;
  const context = vm.createContext({
    Module: { register: (_name, d) => (definition = d) },
    setTimeout: (fn) => timers.push(fn),
    clearTimeout: () => {},
  });
  vm.runInContext('let config = { language: "de" };', context);
  vm.runInContext(source, context);

  const mod = Object.create(definition);
  Object.assign(mod, {
    identifier: "m1",
    config: { ...definition.defaults, frontendTimeout: 30000, webDavAuth: { url: "u", username: "a", password: "p" } },
    translate: translatorFor(de),
    notifications: { EVENT: "EVENT", ERROR: "ERROR" },
    logger: { debug() {}, info() {}, warn() {}, error() {} },
    lifecycle: { render() {}, markDataReceived() {} },
    transport: { sendRequest() {} },
    ...overrides,
  });
  return { mod, timers };
}

function shownTexts(error) {
  return [error.title, ...(error.lines || []), error.hint || ""];
}

test("with language de no visible status or error text stays English", (t) => {
  t.after(installFakeDocument());
  const seen = [];

  // Missing config, both variants.
  for (const webDavAuth of [{}, { url: "https://dav.example/" }]) {
    const { mod } = germanModule();
    assert.equal(mod.verifyConfig({ webDavAuth }), false);
    seen.push(...shownTexts(mod.error));
  }

  // Frontend timeout before the first data.
  const { mod, timers } = germanModule();
  mod.sendConfigure();
  timers[0]();
  seen.push(...shownTexts(mod.error));
  assert.equal(mod.error.hint, "Keine Antwort nach 30 s");

  // A failed update without and with previous data, a failed toggle, a config conflict.
  mod.socketNotificationReceived("EVENT", { identifier: "m1", action: "FETCH_FAILED", error: {} });
  seen.push(...shownTexts(mod.error));
  mod.lastSuccessfulData = [];
  mod.socketNotificationReceived("ERROR", { identifier: "m1", action: "TOGGLE_TASK", error: {} });
  seen.push(...shownTexts(mod.error));
  mod.socketNotificationReceived("EVENT", {
    identifier: "m1",
    action: "CONFIG_REJECTED",
    data: { mismatchKeys: ["sortMethod"] },
  });
  seen.push(...shownTexts(mod.error));
  assert.match(mod.error.lines[0], /weicht .* ab: sortMethod$/);

  // Loading and an empty calendar, rendered with the module's translate().
  const translate = (key) => mod.translate(key);
  seen.push(TaskRenderer.renderModule({ toDoList: null, error: null, config: mod.config, translate }).textContent);
  seen.push(
    TaskRenderer.renderModule({ toDoList: [{ summary: "Cal", tasks: [] }], error: null, config: mod.config, translate })
      .textContent,
  );

  const all = seen.join(" | ");
  for (const english of ENGLISH_TEXTS) {
    assert.ok(!all.includes(english), `"${english}" is still shown: ${all}`);
  }
  assert.ok(all.includes("Alles erledigt") && all.includes("Lade"), all);
});

test("a technical error text from the backend is shown as it is", () => {
  const { mod } = germanModule();
  mod.socketNotificationReceived("EVENT", {
    identifier: "m1",
    action: "FETCH_FAILED",
    error: { message: "CalDAV login timed out after 30000ms" },
  });
  assert.deepEqual([...mod.error.lines], ["CalDAV login timed out after 30000ms"]);
  assert.equal(mod.error.title, "Fehler");
});
