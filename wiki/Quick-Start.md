# Quick Start

Add a module block like this to your MagicMirror `config/config.js`:

```js
{
  module: "MMM-CalDAV-Tasks",
  position: "top_left",
  config: {
    webDavAuth: {
      url: "<CalDAV_URL>",
      username: "<CalDAV_APP_USERNAME>",
      password: "<CalDAV_APP_PASSWORD>",
    },
    includeCalendars: [],
    updateInterval: 10 * 60 * 1000,
  },
}
```

## Multi-Instance Notes

You can run more than one task list in the same MagicMirror setup. If you do, assign a distinct MagicMirror `identifier` to each block so logs and request correlation stay clear.

## Lifecycle Notes

- The module fetches data as soon as the first display connects; the refresh schedule runs
  in the backend, not in the browser.
- With the default `backgroundRefresh: true` refreshing continues while the module is
  hidden, so the list is already up to date when it becomes visible again.
- Set `backgroundRefresh: false` to pause refreshing while every display hides the module;
  showing it again fetches if the data is older than `updateInterval`.
- A failed refresh is retried after 1, 2, 4 … up to 30 minutes.
- Use `quietHours` (e.g. `{ from: "23:00", to: "06:00" }`) to pause polling overnight.