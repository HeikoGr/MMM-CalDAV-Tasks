# Troubleshooting

## Start With Debug Logs

Run MagicMirror in development mode so you can see module and backend output clearly.

## Common Issues

### CalDAV or WebDAV errors

- Double-check the private list URL.
- Verify the username and app password.
- Use the CLI helper from [CLI Debug](CLI-Debug) to test connectivity outside MagicMirror.

### Empty or unexpected task lists

- Check `includeCalendars` first.
- Remember that `startsInDays` and `dueInDays` are both evaluated, so your filter combination may hide more tasks than expected.

### Intermittent backend failures

If you occasionally see temporary WebDAV errors, wait for the next refresh cycle. Using different prime-number-based intervals across multiple CalDAV consumers can reduce collisions with other services polling the same server.

### Long-press does not toggle tasks

- Increase `toggleTime` slightly.
- Verify that your browser or touchscreen setup does not intercept the gesture.
- Test the toggle path with the CLI helper if you need to separate UI issues from backend issues.