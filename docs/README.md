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
- `suspend()` and `resume()` cleanly control the polling timer and frontend timeout.