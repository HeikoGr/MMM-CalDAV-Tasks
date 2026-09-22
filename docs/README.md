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
- The frontend lifecycle comes from `lib/mmm-shared` (`createLifecycle`). With the default
  `backgroundRefresh: true` the polling timer keeps running while the module is hidden, so
  data is warm on the next `resume()`. Only with `backgroundRefresh: false` do
  `suspend()`/`resume()` stop and restart it. The frontend timeout (`frontendTimeout`) is
  armed per request in `getData()` and is independent of visibility.
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
- The write path is covered by `tests/vtodo-completer.test.js`; run it with
  `node --run test`. See `docs/AUDIT_2026-09-21.md` for the audit these fixes came from.