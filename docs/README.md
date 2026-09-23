# MMM-CalDAV-Tasks Documentation

User-facing setup, configuration, and troubleshooting documentation now lives in the project wiki.

- Wiki: <https://github.com/HeikoGr/MMM-CalDAV-Tasks/wiki>

This directory contains the repository's additional technical and development documentation.

## Contents

- [CLI-DEBUG.md](CLI-DEBUG.md): English CLI documentation for the debug tool
- [CLI-DEBUG_DE.md](CLI-DEBUG_DE.md): German CLI documentation for the debug tool
- [DEVCONTAINER.md](DEVCONTAINER.md): Devcontainer-specific notes

## Architecture Notes

- Requests are correlated per module instance via MagicMirror identifiers.
- Long-press handlers are only bound within the current module DOM.
- The backend owns the schedule (`lib/backend-session.js`, a module-local copy shared with
  the other modules of this author). The frontend sends its config once (`CONFIGURE`) and
  reports whether it is visible (`SESSION_STATE`); `node_helper` runs one
  `createLifecycle` from `lib/mmm-shared` per instance on the server - interval, jitter,
  `quietHours`, backoff - and pushes the result as a `DATA` event. With the default
  `backgroundRefresh: true` it keeps refreshing while the module is hidden; with `false` it
  pauses while every display of the instance is hidden. A failed refresh is retried with a
  growing backoff (1, 2, 4 … 30 min) instead of waiting for the next interval.
- The backend knows which displays are connected: an instance whose browser socket is gone
  for 10 minutes is released and no longer fetched. A new connection is greeted with
  `INIT_REQUIRED`, so a display registers again after a server restart without a reload.
- Two displays of one instance share its schedule. The first `CONFIGURE` decides; a later
  one with different credentials is refused (`CONFIG_REJECTED`), other differences are only
  logged.
- The config is validated once, at `CONFIGURE` (`CONFIG_INVALID` on errors). Which tasks are
  shown (`startsInDays`, `dueInDays`, `showWithout*`, `hideCompletedTasksAfter`) is decided in
  the backend (`lib/task-filter.js`); the frontend renders what it gets.
- `frontendTimeout` only covers the first load: without any answer the module shows
  "Request Timeout".
- The long-press toggle works in both directions: `completeVTodo` for an open task,
  `uncompleteVTodo` for a completed one. The frontend sends the state it now shows
  (`checked`/`unchecked`) and `node_helper` picks the matching path.
- Completing one occurrence of a recurring task is two writes: a standalone copy of the
  finished occurrence (new UID, no `RRULE`, no `VALARM`) and the series moved on to its
  next due date. The copy is written first, so a failure in the second write cannot lose
  the completion. If `COUNT`/`UNTIL` is exhausted, the task is simply completed in place.
- `lib/webDavHelper.js` keeps one logged-in client per account (URL + user + password) for
  ten minutes. The cache key is the account, so instances with different credentials never
  share a session.
- One fetch per instance runs at a time. A fetch requested while one is running (the
  refresh after a toggle) runs right after it, so the display never ends up with data read
  before the write. The pushed data carries the parsed tasks only, not the raw ICS.
- `parseICS` unfolds RFC 5545 folded lines for reading but writes untouched properties back
  with their original folding.
- The write path is covered by `tests/vtodo-completer.test.js`; run it with
  `node --run test`.