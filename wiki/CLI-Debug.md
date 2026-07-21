# CLI Debug

The module includes a CLI helper so you can test CalDAV access without starting MagicMirror.

## Common Commands

```bash
node --run debug:config
node --run debug:fetch
node scripts/cli-debug.js toggle <task-uid>
node --run debug:help
```

## Typical Use Cases

- validate your config before restarting MagicMirror
- verify that the CalDAV server is reachable
- inspect returned tasks from the command line
- test task completion toggles manually

Detailed command documentation remains in [docs/CLI-DEBUG.md](../docs/CLI-DEBUG.md).