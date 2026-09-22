const test = require("node:test");
const assert = require("node:assert/strict");

const { validateConfig, getDefaults } = require("../lib/config-validator");

const auth = {
  url: "https://dav.example/remote.php/dav/",
  username: "user",
  password: "secret",
};

test("a minimal config is valid and gets the defaults merged in", () => {
  const { valid, config, errors } = validateConfig({ webDavAuth: auth });

  assert.equal(valid, true);
  assert.deepEqual(errors, []);
  assert.equal(config.updateInterval, 10 * 60 * 1000);
  assert.equal(config.requestTimeout, 30000);
  assert.deepEqual(config.includeCalendars, []);
});

test("missing credentials are reported", () => {
  const { valid, errors } = validateConfig({});

  assert.equal(valid, false);
  assert.ok(errors.some((e) => e.key === "webDavAuth"));
});

test("an incomplete webDavAuth is reported per field", () => {
  const { valid, errors } = validateConfig({
    webDavAuth: { url: "https://dav.example/" },
  });

  assert.equal(valid, false);
  assert.ok(errors.some((e) => e.key === "webDavAuth.username"));
  assert.ok(errors.some((e) => e.key === "webDavAuth.password"));
});

test("wrong types, unknown enums and out-of-range numbers are rejected", () => {
  const { valid, errors } = validateConfig({
    webDavAuth: auth,
    updateInterval: "often",
    sortMethod: "alphabetical",
    mapEmptyPriorityTo: 42,
  });

  assert.equal(valid, false);
  assert.ok(errors.some((e) => e.type === "type" && e.key === "updateInterval"));
  assert.ok(errors.some((e) => e.type === "enum" && e.key === "sortMethod"));
  assert.ok(
    errors.some((e) => e.type === "range" && e.key === "mapEmptyPriorityTo"),
  );
});

test("user values win over defaults", () => {
  const { config } = validateConfig({
    webDavAuth: auth,
    updateInterval: 5 * 60 * 1000,
    includeCalendars: ["Privat"],
  });

  assert.equal(config.updateInterval, 5 * 60 * 1000);
  assert.deepEqual(config.includeCalendars, ["Privat"]);
});

test("getDefaults covers the options the request paths rely on", () => {
  const defaults = getDefaults();

  // Both getData() and the toggle path read these without a fallback.
  assert.equal(typeof defaults.requestTimeout, "number");
  assert.equal(typeof defaults.dateFormat, "string");
  assert.equal(typeof defaults.mapEmptyPriorityTo, "number");
  assert.equal(typeof defaults.mapEmptySortIndexTo, "number");
  assert.equal(typeof defaults.sortMethod, "string");
  assert.ok(Array.isArray(defaults.includeCalendars));
});
