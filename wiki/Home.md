# MMM-CalDAV-Tasks Wiki

MMM-CalDAV-Tasks displays CalDAV task lists in MagicMirror and can optionally toggle task completion by long press.

Use this wiki if you want to:

- install the module cleanly
- prepare Nextcloud app credentials and private list URLs
- start with a minimal working config
- tune sorting, filtering, and display options
- troubleshoot connection, timing, or long-press issues

## Start Here

- [Installation](Installation)
- [Update](Update)
- [Nextcloud Preparation](Nextcloud-Preparation)
- [Quick Start](Quick-Start)
- [Configuration](Configuration)
- [CLI Debug](CLI-Debug)
- [Troubleshooting](Troubleshooting)

## Typical Setup Path

1. Install the module and run `npm install`.
2. Create a dedicated Nextcloud app password and copy the private task-list link.
3. Start with the example from [Quick Start](Quick-Start).
4. Adjust filters, headings, and colors in [Configuration](Configuration).
5. Use [CLI Debug](CLI-Debug) if the backend cannot reach your CalDAV server.

## What Stays In The Repository Docs

Technical and development notes stay in `docs/`, especially the CLI deep-dive and devcontainer notes.