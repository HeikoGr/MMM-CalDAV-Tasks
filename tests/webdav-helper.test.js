const test = require("node:test");
const assert = require("node:assert/strict");

const { initDAVClient, parseList } = require("../lib/webDavHelper");

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
   * The client used to live in a module-level variable that every call
   * reassigned, so two instances logging in at the same time could end up
   * reading the other account's calendars.
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
  const [task] = parseList(
    [{ filename: "https://dav.example/u/t/AAAA.ics", icsStr }],
    "DD.MM.YYYY HH:mm",
  );

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

  const [task] = parseList(
    [{ filename: "https://dav.example/u/t/AAAA.ics", icsStr: allDay }],
    "DD.MM.YYYY HH:mm",
  );

  assert.equal(task.dueDateOnly, true);
  assert.ok(!task.dueFormatted.includes(":"), task.dueFormatted);
});

test("non-VTODO components are ignored", () => {
  const withEvent = icsStr.replace(
    "BEGIN:VTODO",
    "BEGIN:VEVENT\r\nUID:EVENT\r\nSUMMARY:Not a task\r\nEND:VEVENT\r\nBEGIN:VTODO",
  );

  const tasks = parseList(
    [{ filename: "https://dav.example/u/t/AAAA.ics", icsStr: withEvent }],
    "DD.MM.YYYY",
  );

  assert.equal(tasks.length, 1);
  assert.equal(tasks[0].summary, "Timed task");
});
