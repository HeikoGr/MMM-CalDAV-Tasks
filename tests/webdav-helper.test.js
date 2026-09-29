const test = require("node:test");
const assert = require("node:assert/strict");

const { calendarDisplayName, initDAVClient, parseList, withTimeout } = require("../lib/webDavHelper");

const accountA = {
  webDavAuth: {
    url: "https://a.example/remote.php/dav/",
    username: "alice",
    password: "secret-a",
  },
};
const accountB = {
  webDavAuth: {
    url: "https://b.example/remote.php/dav/",
    username: "bob",
    password: "secret-b",
  },
};

test("each instance gets its own DAV client", () => {
  /*
   * A client shared across accounts would let two instances logging in at the
   * same time read the other account's calendars.
   */
  const clientA = initDAVClient(accountA);
  const clientB = initDAVClient(accountB);

  assert.notEqual(clientA, clientB);
  assert.equal(clientA.serverUrl, accountA.webDavAuth.url);
  assert.equal(clientB.serverUrl, accountB.webDavAuth.url);
  assert.equal(clientA.credentials.username, "alice");
  assert.equal(clientB.credentials.username, "bob");
});

test("initDAVClient does not hand out a shared instance", () => {
  assert.notEqual(initDAVClient(accountA), initDAVClient(accountA));
});

const icsStr = [
  "BEGIN:VCALENDAR",
  "VERSION:2.0",
  "BEGIN:VTODO",
  "UID:AAAA",
  "SUMMARY:Timed task",
  "DTSTART:20260922T080000Z",
  "DUE:20260922T100000Z",
  "STATUS:NEEDS-ACTION",
  "END:VTODO",
  "END:VCALENDAR",
  "",
].join("\r\n");

test("parseList normalises dates to ISO for the frontend", () => {
  const [task] = parseList([{ filename: "https://dav.example/u/t/AAAA.ics", icsStr }], "DD.MM.YYYY HH:mm");

  assert.equal(task.filename, "https://dav.example/u/t/AAAA.ics");
  assert.equal(task.dueISO, "2026-09-22T10:00:00.000Z");
  assert.equal(task.startISO, "2026-09-22T08:00:00.000Z");
  assert.equal(task.completedISO, null);
  assert.equal(task.dueDateOnly, false);
});

test("an all-day task is not rendered with a misleading 00:00", () => {
  const allDay = icsStr
    .replace("DTSTART:20260922T080000Z", "DTSTART;VALUE=DATE:20260922")
    .replace("DUE:20260922T100000Z", "DUE;VALUE=DATE:20260923");

  const [task] = parseList([{ filename: "https://dav.example/u/t/AAAA.ics", icsStr: allDay }], "DD.MM.YYYY HH:mm");

  assert.equal(task.dueDateOnly, true);
  assert.ok(!task.dueFormatted.includes(":"), task.dueFormatted);
});

test("non-VTODO components are ignored", () => {
  const withEvent = icsStr.replace(
    "BEGIN:VTODO",
    "BEGIN:VEVENT\r\nUID:EVENT\r\nSUMMARY:Not a task\r\nEND:VEVENT\r\nBEGIN:VTODO",
  );

  const tasks = parseList([{ filename: "https://dav.example/u/t/AAAA.ics", icsStr: withEvent }], "DD.MM.YYYY");

  assert.equal(tasks.length, 1);
  assert.equal(tasks[0].summary, "Timed task");
});

test("withTimeout rejects a request that takes too long", async () => {
  await assert.rejects(
    withTimeout(new Promise(() => {}), 10, "Fetch calendars"),
    /Fetch calendars timed out after 10ms/,
  );
});

test("withTimeout leaves no timer behind once the request answered", async () => {
  const before = process.getActiveResourcesInfo().filter((r) => r === "Timeout").length;
  assert.equal(await withTimeout(Promise.resolve("ok"), 60 * 1000, "Fetch"), "ok");
  const after = process.getActiveResourcesInfo().filter((r) => r === "Timeout").length;
  assert.equal(after, before);
});

test("withTimeout cancels the request it gave up on", async () => {
  let received = null;
  const request = (signal) => {
    received = signal;
    return new Promise(() => {});
  };

  await assert.rejects(withTimeout(request, 10, "Fetch calendars"), /Fetch calendars timed out after 10ms/);
  assert.equal(received.aborted, true, "the HTTP request must be aborted, not left running");
});

test("withTimeout does not abort a request that answered in time", async () => {
  let received = null;
  const result = await withTimeout(
    (signal) => {
      received = signal;
      return Promise.resolve("ok");
    },
    60 * 1000,
    "Fetch",
  );

  assert.equal(result, "ok");
  assert.equal(received.aborted, false);
});

test("calendarDisplayName drops the owner suffix of shared calendars only", () => {
  const shared = "https://a.example/remote.php/dav/calendars/me/alexandra-1_shared_by_Alex/";
  assert.equal(calendarDisplayName({ url: shared, displayName: "Alexandra (Alex)" }), "Alexandra");
  assert.equal(calendarDisplayName({ url: shared, displayName: "Alexandra" }), "Alexandra");
  assert.equal(
    calendarDisplayName({ url: "https://a.example/calendars/me/own/", displayName: "Einkauf (Wochenende)" }),
    "Einkauf (Wochenende)",
  );
});

/** A login that only sets the discovered account, as DAVClient.login() does. */
async function fakeLogin() {
  this.account = { rootUrl: "https://cloud.example/", homeUrl: "https://cloud.example/cal/" };
}

/** PROPFIND responses of a calendar home listing these calendars. */
function davListing(calendars) {
  return calendars.map(({ url, components = [], displayName, ctag }) => ({
    href: new URL(url).pathname,
    props: {
      resourcetype: { collection: {}, calendar: {} },
      ...(displayName ? { displayname: displayName } : {}),
      ...(ctag ? { getctag: ctag } : {}),
      ...(components.length
        ? { supportedCalendarComponentSet: { comp: components.map((name) => ({ _attributes: { name } })) } }
        : {}),
    },
  }));
}

test("a calendar without component set or display name is skipped instead of failing the fetch", async (t) => {
  const { DAVClient } = require("tsdav");
  const { fetchCalendarData } = require("../lib/webDavHelper");
  t.mock.method(DAVClient.prototype, "login", fakeLogin);
  t.mock.method(DAVClient.prototype, "propfind", async () =>
    davListing([
      { url: "https://cloud.example/cal/bare/" },
      { url: "https://cloud.example/cal/tasks/", components: ["VTODO"], displayName: "Tasks" },
    ]),
  );
  t.mock.method(DAVClient.prototype, "fetchCalendarObjects", async () => []);

  const data = await fetchCalendarData({
    webDavAuth: { url: "https://cloud.example/remote.php/dav/", username: "bare-server", password: "p" },
    includeCalendars: ["tasks"],
    requestTimeout: 1000,
  });

  assert.deepEqual(
    data.map((calendar) => calendar.summary),
    ["Tasks"],
  );
});

test("the account discovery is reused across fetch cycles and repeated after a failure", async (t) => {
  const { DAVClient } = require("tsdav");
  const { fetchCalendarData } = require("../lib/webDavHelper");
  const login = t.mock.method(DAVClient.prototype, "login", fakeLogin);
  let failNext = false;
  t.mock.method(DAVClient.prototype, "propfind", async () => {
    if (failNext) {
      failNext = false;
      throw new Error("401 Unauthorized");
    }
    return davListing([{ url: "https://cloud.example/cal/tasks/", components: ["VTODO"], displayName: "Tasks" }]);
  });
  t.mock.method(DAVClient.prototype, "fetchCalendarObjects", async () => []);
  const config = {
    webDavAuth: { url: "https://cloud.example/remote.php/dav/", username: "reuse", password: "p" },
    includeCalendars: [],
    requestTimeout: 1000,
  };

  // Eleven minutes apart, like two cycles of the default 10-minute interval with jitter.
  const now = Date.now();
  const clock = t.mock.method(Date, "now", () => now);
  await fetchCalendarData(config);
  clock.mock.mockImplementation(() => now + 11 * 60 * 1000);
  await fetchCalendarData(config);
  assert.equal(login.mock.callCount(), 1, "no new discovery per cycle");

  failNext = true;
  await assert.rejects(fetchCalendarData(config));
  await fetchCalendarData(config);
  assert.equal(login.mock.callCount(), 2, "a failed request discards the client");
});

test("a calendar with an unchanged ctag is not fetched again; the others are fetched side by side", async (t) => {
  const { DAVClient } = require("tsdav");
  const { fetchCalendarData } = require("../lib/webDavHelper");
  t.mock.method(DAVClient.prototype, "login", fakeLogin);
  const ctags = { a: "1", b: "1", c: undefined };
  t.mock.method(DAVClient.prototype, "propfind", async () =>
    davListing(
      Object.entries(ctags).map(([name, ctag]) => ({
        url: `https://cloud.example/cal/${name}/`,
        components: ["VTODO"],
        displayName: name,
        ctag,
      })),
    ),
  );
  let active = 0;
  let maxActive = 0;
  const fetched = [];
  t.mock.method(DAVClient.prototype, "fetchCalendarObjects", async ({ calendar }) => {
    active += 1;
    maxActive = Math.max(maxActive, active);
    fetched.push(calendar.displayName);
    await new Promise((resolve) => setTimeout(resolve, 10));
    active -= 1;
    return [{ url: `${calendar.url}task.ics`, data: `ctag ${ctags[calendar.displayName]}` }];
  });
  const config = {
    webDavAuth: { url: "https://cloud.example/remote.php/dav/", username: "ctag", password: "p" },
    includeCalendars: [],
    requestTimeout: 1000,
  };

  await fetchCalendarData(config);
  assert.deepEqual(fetched.sort(), ["a", "b", "c"]);
  assert.equal(maxActive, 3, "calendars are fetched at the same time");

  fetched.length = 0;
  ctags.b = "2";
  const data = await fetchCalendarData(config);
  assert.deepEqual(fetched.sort(), ["b", "c"], "unchanged a is reused, changed b and ctag-less c are fetched");
  assert.deepEqual(
    data.map((calendar) => calendar.icsStrings[0].icsStr),
    ["ctag 1", "ctag 2", "ctag undefined"],
  );
});
