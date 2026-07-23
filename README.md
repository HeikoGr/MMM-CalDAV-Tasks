# MMM-CalDAV-Tasks

MagicMirror module for CalDAV task lists, including long-press task completion and multi-instance support.

## Screenshots

![Overview](example.png)


## Installation

```bash
cd ~/MagicMirror/modules
git clone https://github.com/HeikoGr/MMM-CalDAV-Tasks
cd MMM-CalDAV-Tasks
npm ci --omit=dev
```

## Update

```bash
cd ~/MagicMirror/modules/MMM-CalDAV-Tasks
git pull
npm ci --omit=dev
```

## Configuration

```js
{
    module: "MMM-CalDAV-Tasks",
    config: {
        webDavAuth: {
            url: "<CalDAV_URL>",
            username: "<CalDAV_APP_USERNAME>",
            password: "<CalDAV_APP_PASSWORD>",
        },
        includeCalendars: [],
        updateInterval: 60 * 1000,
    },
},
```

## Documentation

User-facing documentation now lives in the project wiki:

- [Wiki Home](https://github.com/HeikoGr/MMM-CalDAV-Tasks/wiki)
- [Installation](https://github.com/HeikoGr/MMM-CalDAV-Tasks/wiki/Installation)
- [Update](https://github.com/HeikoGr/MMM-CalDAV-Tasks/wiki/Update)
- [Nextcloud Preparation](https://github.com/HeikoGr/MMM-CalDAV-Tasks/wiki/Nextcloud-Preparation)
- [Quick Start](https://github.com/HeikoGr/MMM-CalDAV-Tasks/wiki/Quick-Start)
- [Configuration](https://github.com/HeikoGr/MMM-CalDAV-Tasks/wiki/Configuration)
- [CLI Debug](https://github.com/HeikoGr/MMM-CalDAV-Tasks/wiki/CLI-Debug)
- [Troubleshooting](https://github.com/HeikoGr/MMM-CalDAV-Tasks/wiki/Troubleshooting)

Technical and development documentation remains in `docs/`:

- [docs/README.md](docs/README.md)
- [docs/CLI-DEBUG.md](docs/CLI-DEBUG.md)
- [docs/CLI-DEBUG_DE.md](docs/CLI-DEBUG_DE.md)
- [docs/DEVCONTAINER.md](docs/DEVCONTAINER.md)