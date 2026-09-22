const test = require("node:test");
const assert = require("node:assert/strict");

const shared = require("../lib/mmm-shared/mmm-shared");
const { loadNodeHelper } = require("./helpers/node-helper-loader.js");
const { prop } = require("./helpers/ics.js");

const notifications = shared.buildNotifications("MMM-CalDAV-Tasks");

const FILENAME = "https://dav.example/calendars/user/tasks/AAAA.ics";
const config = {
  webDavAuth: {
    url: "https://dav.example/remote.php/dav/",
    username: "alice",
    password: "secret",
  },
};

const OPEN_TASK = [
  "BEGIN:VCALENDAR",
  "VERSION:2.0",
  "BEGIN:VTODO",
  "UID:AAAA",
  "SUMMARY:Trash",
  "DUE:20200105T100000Z",
  "STATUS:NEEDS-ACTION",
  "END:VTODO",
  "END:VCALENDAR",
  "",
].join("\r\n");

const DONE_TASK = OPEN_TASK.replace(
  "STATUS:NEEDS-ACTION",
  "STATUS:COMPLETED\r\nCOMPLETED:20260920T080000Z\r\nPERCENT-COMPLETE:100",
);

/**
 * Start a node helper whose WebDAV layer is recorded in memory.
 * @param {string} ics - The ICS content the server would return.
 * @returns {Object} Helper, recorded writes and sent socket notifications.
 */
function startHelper(ics) {
  const puts = [];
  const sent = [];

  const helper = loadNodeHelper({
    initDAVClient: () => ({ stub: true }),
    fetchCalendarData: async () => [],
    parseList: () => [],
    mapEmptyPriorityTo: (list) => list,
    mapEmptySortIndexTo: (list) => list,
    getFileContents: async () => ({ data: ics }),
    putFileContents: async (_config, filename, data, options) => {
      puts.push({ filename, data, options });
      return { ok: true };
    },
  });

  helper.sendSocketNotification = (notification, payload) => {
    sent.push({ notification, payload });
  };
  helper.start();

  return { helper, puts, sent };
}

function toggleRequest(status) {
  return {
    identifier: "module_1_MMM-CalDAV-Tasks",
    instanceId: "module_1_MMM-CalDAV-Tasks",
    requestId: "req-1",
    action: "TOGGLE_TASK",
    data: { config, filename: FILENAME, status },
  };
}

/** Let the helper's promise chain settle. */
const settle = () => new Promise((resolve) => setImmediate(resolve));

test('a "checked" toggle completes the task', async () => {
  const { helper, puts, sent } = startHelper(OPEN_TASK);

  helper.socketNotificationReceived(
    notifications.REQUEST,
    toggleRequest("checked"),
  );
  await settle();

  assert.equal(puts.length, 1);
  assert.equal(prop(puts[0].data, "VTODO", "STATUS"), "COMPLETED");
  assert.equal(sent.at(-1).notification, notifications.RESPONSE);
  assert.equal(sent.at(-1).payload.ok, true);
});

test('an "unchecked" toggle reopens the task instead of completing it again', async () => {
  const { helper, puts, sent } = startHelper(DONE_TASK);

  helper.socketNotificationReceived(
    notifications.REQUEST,
    toggleRequest("unchecked"),
  );
  await settle();

  assert.equal(puts.length, 1);
  assert.equal(prop(puts[0].data, "VTODO", "STATUS"), "NEEDS-ACTION");
  assert.equal(prop(puts[0].data, "VTODO", "COMPLETED"), null);
  assert.equal(prop(puts[0].data, "VTODO", "PERCENT-COMPLETE"), null);
  assert.equal(sent.at(-1).payload.ok, true);
});

test("an invalid config is rejected on the toggle path too", async () => {
  const { helper, puts, sent } = startHelper(OPEN_TASK);

  helper.socketNotificationReceived(notifications.REQUEST, {
    ...toggleRequest("checked"),
    data: { config: { webDavAuth: { url: "https://dav.example/" } }, filename: FILENAME },
  });
  await settle();

  assert.equal(puts.length, 0, "nothing may be written with a broken config");
  assert.equal(sent.at(-1).notification, notifications.ERROR);
  assert.equal(sent.at(-1).payload.error.code, "TOGGLE_FAILED");
});

test("a rejected write is reported as an error, not as a successful toggle", async () => {
  const { helper, sent } = startHelper(OPEN_TASK);
  helper.socketNotificationReceived(notifications.REQUEST, toggleRequest("checked"));
  await settle();

  const failing = loadNodeHelper({
    initDAVClient: () => ({ stub: true }),
    fetchCalendarData: async () => [],
    parseList: () => [],
    mapEmptyPriorityTo: (list) => list,
    mapEmptySortIndexTo: (list) => list,
    getFileContents: async () => ({ data: OPEN_TASK }),
    putFileContents: async () => {
      throw new Error("CalDAV write failed with 403 Forbidden");
    },
  });
  const errors = [];
  failing.sendSocketNotification = (notification, payload) =>
    errors.push({ notification, payload });
  failing.start();

  failing.socketNotificationReceived(notifications.REQUEST, toggleRequest("checked"));
  await settle();

  assert.equal(errors.at(-1).notification, notifications.ERROR);
  assert.match(errors.at(-1).payload.error.message, /403/);
  assert.equal(sent.at(-1).payload.ok, true, "the first helper still succeeded");
});
