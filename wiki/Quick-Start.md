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
    updateInterval: 60 * 1000,
  },
}
```

## Multi-Instance Notes

You can run more than one task list in the same MagicMirror setup. If you do, assign a distinct MagicMirror `identifier` to each block so logs and request correlation stay clear.

## Lifecycle Notes

- The module fetches data immediately on startup.
- While the module is hidden or suspended, polling stops.
- On resume, polling restarts with a fresh fetch.