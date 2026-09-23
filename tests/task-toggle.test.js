const test = require("node:test");
const assert = require("node:assert/strict");

const VTodoCompleter = require("../lib/vtodo-completer.js");
const { toggleTask } = require("../lib/task-toggle");

const FILENAME = "https://dav.example/calendars/user/tasks/SERIES.ics";
const RECURRING = [
  "BEGIN:VCALENDAR",
  "VERSION:2.0",
  "BEGIN:VTODO",
  "UID:SERIES",
  "SUMMARY:Trash",
  "DTSTART:20200105T080000Z",
  "DUE:20200105T100000Z",
  "STATUS:NEEDS-ACTION",
  "RRULE:FREQ=DAILY",
  "END:VTODO",
  "END:VCALENDAR",
  "",
].join("\r\n");

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** A completer whose reads and writes are recorded; writes take `writeMs`. */
function recordingCompleter(log, writeMs) {
  return (completerOptions) =>
    new VTodoCompleter({
      ...completerOptions,
      getFileContents: async (_config, filename) => {
        log.push(`get ${filename}`);
        return { data: RECURRING };
      },
      putFileContents: async (_config, filename) => {
        log.push(`put-start ${filename === FILENAME ? "series" : "occurrence"}`);
        await wait(writeMs);
        log.push(`put-end ${filename === FILENAME ? "series" : "occurrence"}`);
        return { ok: true };
      },
    });
}

test("after a timeout no further write starts, and the late end triggers a refresh", async () => {
  const log = [];
  let lateSettled = false;

  await assert.rejects(
    toggleTask({ requestTimeout: 20 }, FILENAME, "checked", {
      createCompleter: recordingCompleter(log, 60),
      onLateSettle: () => {
        lateSettled = true;
      },
    }),
    /timed out after 20ms/,
  );

  await wait(100);
  // The occurrence write was already on its way and finishes; moving the series
  // would have been the second write - it must not start after the timeout.
  assert.deepEqual(log, [`get ${FILENAME}`, "put-start occurrence", "put-end occurrence"]);
  assert.equal(lateSettled, true);
});

test("two toggles of the same task run one after the other", async () => {
  const log = [];
  const options = { createCompleter: recordingCompleter(log, 10) };

  await Promise.all([
    toggleTask({ requestTimeout: 1000 }, FILENAME, "checked", options),
    toggleTask({ requestTimeout: 1000 }, FILENAME, "checked", options),
  ]);

  const firstEnd = log.indexOf("put-end series");
  const secondGet = log.lastIndexOf(`get ${FILENAME}`);
  assert.ok(firstEnd !== -1 && secondGet > firstEnd, `second toggle read before the first finished: ${log.join(", ")}`);
});

test("a toggle that finishes in time does not call onLateSettle", async () => {
  let lateSettled = false;
  await toggleTask({ requestTimeout: 1000 }, FILENAME, "checked", {
    createCompleter: recordingCompleter([], 1),
    onLateSettle: () => {
      lateSettled = true;
    },
  });
  await wait(10);
  assert.equal(lateSettled, false);
});

test("a toggle that fails before writing does not block the next one", async () => {
  await assert.rejects(
    toggleTask({ requestTimeout: 1000 }, FILENAME, "checked", {
      createCompleter: () => {
        throw new Error("no client");
      },
    }),
    /no client/,
  );
  await toggleTask({ requestTimeout: 1000 }, FILENAME, "checked", {
    createCompleter: recordingCompleter([], 1),
  });
});
