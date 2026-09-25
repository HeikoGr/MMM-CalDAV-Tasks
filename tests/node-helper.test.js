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

const realWebDav = require("../lib/webDavHelper.js");
const IDENTIFIER = "module_1_MMM-CalDAV-Tasks";

/**
 * Start a node helper whose WebDAV layer is recorded in memory. The helper is
 * stopped after the test, so its backend schedule does not keep node alive.
 * @param {Object} t - The test context.
 * @param {string} ics - The ICS content the server would return.
 * @param {Object} [overrides] - Replacements for the WebDAV stub.
 * @returns {Object} Helper, recorded writes, fetches and sent notifications.
 */
function startHelper(t, ics, overrides = {}) {
  const puts = [];
  const sent = [];
  const fetches = [];

  const helper = loadNodeHelper({
    fetchCalendarData: async (cfg) => {
      fetches.push(cfg);
      return [
        {
          url: "https://dav.example/calendars/user/tasks/",
          summary: "Tasks",
          icsStrings: [{ filename: FILENAME, icsStr: ics }],
        },
      ];
    },
    parseList: realWebDav.parseList,
    mapEmptyPriorityTo: realWebDav.mapEmptyPriorityTo,
    mapEmptySortIndexTo: realWebDav.mapEmptySortIndexTo,
    getFileContents: async () => ({ data: ics }),
    putFileContents: async (_config, filename, data, options) => {
      puts.push({ filename, data, options });
      return { ok: true };
    },
    ...overrides,
  });

  helper.sendSocketNotification = (notification, payload) => {
    sent.push({ notification, payload });
  };
  helper.start();
  t.after(() => helper.stop());

  const events = (action) =>
    sent.filter((entry) => entry.notification === notifications.EVENT && entry.payload.action === action);

  return { helper, puts, sent, fetches, events };
}

function send(helper, action, data) {
  helper.socketNotificationReceived(notifications.REQUEST, {
    identifier: IDENTIFIER,
    instanceId: IDENTIFIER,
    requestId: `req-${action}`,
    action,
    data,
  });
}

function toggle(helper, status) {
  send(helper, "TOGGLE_TASK", { filename: FILENAME, status });
}

/** Let the helper's promise chains settle. */
const settle = async () => {
  for (let i = 0; i < 5; i++) {
    await new Promise((resolve) => setImmediate(resolve));
  }
};

test("CONFIGURE starts the backend schedule and pushes the task list", async (t) => {
  const { helper, fetches, events } = startHelper(t, OPEN_TASK);

  send(helper, "CONFIGURE", { config });
  await settle();

  assert.equal(fetches.length, 1, "the backend fetches on its own");
  assert.equal(fetches[0].updateInterval, 10 * 60 * 1000, "defaults applied once, at CONFIGURE");
  const [calendar] = events("DATA").at(-1).payload.data;
  assert.equal(calendar.tasks.length, 1);
  assert.equal(calendar.tasks[0].summary, "Trash");
  assert.equal(calendar.icsStrings, undefined, "no raw ICS in the payload");
});

test("tasks hidden by the date options never leave the backend", async (t) => {
  const oldDone = DONE_TASK.replace("COMPLETED:20260920T080000Z", "COMPLETED:20200101T080000Z");
  const { helper, events } = startHelper(t, oldDone);

  send(helper, "CONFIGURE", { config });
  await settle();

  const [calendar] = events("DATA").at(-1).payload.data;
  assert.deepEqual(calendar.tasks, [], "completed long ago, hidden after 1 day");
});

test('a "checked" toggle completes the task and refreshes the list', async (t) => {
  const { helper, puts, sent, fetches } = startHelper(t, OPEN_TASK);
  send(helper, "CONFIGURE", { config });
  await settle();

  toggle(helper, "checked");
  await settle();

  assert.equal(puts.length, 1);
  assert.equal(prop(puts[0].data, "VTODO", "STATUS"), "COMPLETED");
  const reply = sent.find((entry) => entry.notification === notifications.RESPONSE);
  assert.equal(reply.payload.ok, true);
  assert.equal(fetches.length, 2, "the list is fetched again right after the write");
});

test('an "unchecked" toggle reopens the task instead of completing it again', async (t) => {
  const { helper, puts } = startHelper(t, DONE_TASK);
  send(helper, "CONFIGURE", { config });
  await settle();

  toggle(helper, "unchecked");
  await settle();

  assert.equal(puts.length, 1);
  assert.equal(prop(puts[0].data, "VTODO", "STATUS"), "NEEDS-ACTION");
  assert.equal(prop(puts[0].data, "VTODO", "COMPLETED"), null);
  assert.equal(prop(puts[0].data, "VTODO", "PERCENT-COMPLETE"), null);
});

test("an invalid config is refused at CONFIGURE and nothing is written", async (t) => {
  const { helper, puts, sent, fetches, events } = startHelper(t, OPEN_TASK);

  send(helper, "CONFIGURE", {
    config: { webDavAuth: { url: "https://dav.example/" } },
  });
  await settle();
  assert.equal(events("CONFIG_INVALID").length, 1);
  assert.equal(fetches.length, 0);

  toggle(helper, "checked");
  await settle();
  assert.equal(puts.length, 0, "nothing may be written without a valid config");
  assert.equal(sent.at(-1).notification, notifications.ERROR);
  assert.equal(sent.at(-1).payload.error.code, "CONFIG_MISSING");
  assert.equal(events("INIT_REQUIRED").length, 1, "the frontend is asked for CONFIGURE");
});

test("a rejected write is reported as an error, not as a successful toggle", async (t) => {
  const { helper, sent } = startHelper(t, OPEN_TASK, {
    putFileContents: async () => {
      throw new Error("CalDAV write failed with 403 Forbidden");
    },
  });
  send(helper, "CONFIGURE", { config });
  await settle();

  toggle(helper, "checked");
  await settle();

  assert.equal(sent.at(-1).notification, notifications.ERROR);
  assert.equal(sent.at(-1).payload.error.code, "TOGGLE_TASK_FAILED");
  assert.match(sent.at(-1).payload.error.message, /403/);
});

test("a failed fetch is pushed as FETCH_FAILED", async (t) => {
  const { helper, events } = startHelper(t, OPEN_TASK, {
    fetchCalendarData: async () => {
      throw new Error("ECONNREFUSED");
    },
  });
  send(helper, "CONFIGURE", { config });
  await settle();

  const failure = events("FETCH_FAILED").at(-1);
  assert.equal(failure.payload.error.code, "FETCH_FAILED");
  assert.match(failure.payload.error.message, /ECONNREFUSED/);
});

test("each instance logs at its own logLevel", async (t) => {
  const lines = [];
  const originalDebug = console.debug;
  console.debug = (line) => lines.push(String(line));
  t.after(() => {
    console.debug = originalDebug;
  });

  const { helper } = startHelper(t, OPEN_TASK);
  const quiet = "module_1_MMM-CalDAV-Tasks";
  const verbose = "module_2_MMM-CalDAV-Tasks";
  for (const [identifier, logLevel] of [
    [quiet, "warn"],
    [verbose, "debug"],
  ]) {
    helper.socketNotificationReceived(notifications.REQUEST, {
      identifier,
      instanceId: identifier,
      requestId: `req-${identifier}`,
      action: "CONFIGURE",
      data: { config: { ...config, logLevel } },
    });
  }
  await settle();

  const fetchLines = (identifier) => lines.filter((line) => line.includes(`Fetching tasks for ${identifier}`));
  assert.equal(fetchLines(verbose).length, 1, "the debug instance logs its fetch");
  assert.equal(fetchLines(quiet).length, 0, "the warn instance stays quiet, although configured first");
});
