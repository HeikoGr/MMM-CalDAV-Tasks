# GitHub Copilot repository instructions (strict)

## Scope and safety

- Only change code and files inside this repository.
- Keep changes minimal and directly related to the request/issue.
- Do not introduce new dependencies unless explicitly required; if you do, update `package.json` (and existing lockfiles).
- Never commit secrets (tokens, API keys, session cookies, personal data).

## MagicMirror module conventions

- Preserve the standard MagicMirror module structure and naming (e.g., `MMM-*.js`, `node_helper.js`, `translations/`, `*.css`).
- Keep the public module API stable (`Module.register`, notification handling, config schema) unless the request requires a breaking change.
- Prefer predictable caching and clear logging for external API calls.

## This module's architecture

- Shared infrastructure comes from the `lib/mmm-shared` submodule: transport
  (`createTransport`/`createNodeTransport`), `createLogger`, `createErrorFactory` and
  `createLifecycle`. Do not reimplement polling, request correlation or logging locally.
- The frontend owns no fetch timer. `createLifecycle` drives fetching; rendering happens
  through `lifecycle.render()` after data arrives, never from an interval callback.
- `lib/` modules log through `lib/logger.js` (fed by `node_helper`), not `console`, so
  levels and password redaction apply.
- The long-press toggle is the only path that writes to the server, and it works in both
  directions (`completeVTodo` / `uncompleteVTodo` in `lib/vtodo-completer.js`). Recurring
  tasks are split into a completed occurrence plus a series moved to its next due date.
- ICS content is CRLF. `parseICS` strips the CR; keep it that way - matching against a
  component name with a trailing CR silently breaks every lookup.

## Quality bar

- Follow the repository's existing Biome configuration.
- Avoid broad refactors “for cleanliness”; do focused edits.
- Changes to `lib/vtodo-completer.js` need a test in `tests/`; it is the only code that
  writes back to the user's calendar. Run `node --run test` and `node --run lint`.

## References

- GitHub Copilot repository instructions: https://docs.github.com/de/copilot/how-tos/configure-custom-instructions/add-repository-instructions
- MagicMirror² documentation: https://docs.magicmirror.builders/
- MagicMirror² module development: https://docs.magicmirror.builders/development/module-development.html
- MagicMirror² configuration reference: https://docs.magicmirror.builders/configuration/introduction.html
- Node.js documentation: https://nodejs.org/en/docs
- npm CLI documentation: https://docs.npmjs.com/cli/
- tsdav (CalDAV client) docs: https://tsdav.vercel.app/
- RFC 5545 (iCalendar, VTODO): https://www.rfc-editor.org/rfc/rfc5545
