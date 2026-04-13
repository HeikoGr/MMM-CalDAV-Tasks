# MMM-CalDAV-Tasks Documentation

This directory contains the repository's additional documentation. The main entry point for installation, configuration, and usage remains [../README.md](../README.md).

## Contents

- [CLI-DEBUG.md](CLI-DEBUG.md): English CLI documentation for the debug tool
- [CLI-DEBUG_DE.md](CLI-DEBUG_DE.md): German CLI documentation for the debug tool
- [DEVCONTAINER.md](DEVCONTAINER.md): Devcontainer-specific notes

## Architecture Notes

- Requests are correlated per module instance via MagicMirror identifiers.
- Long-press handlers are only bound within the current module DOM.
- `suspend()` and `resume()` cleanly control the polling timer and frontend timeout.