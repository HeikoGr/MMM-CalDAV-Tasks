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

### What a long press does

The long press toggles: an open task is completed, a completed one is reopened. Completed
tasks stay visible for `hideCompletedTasksAfter` days, so a mistaken tap can be undone on
the mirror itself.

For a recurring task, completing one occurrence writes a separate, completed copy of that
occurrence and moves the series on to its next due date - so the history stays and the
series keeps running. When the recurrence rule has no occurrence left, the task is simply
completed and the series ends.

If a write is rejected by the server, the module shows "Update failed / Showing previous
data" and the task returns to its previous state right away. The notice stays until the
next successful refresh.