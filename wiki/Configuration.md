# Configuration

## Core Options

| Option | Description |
| --- | --- |
| `webDavAuth` | Required authentication object with `url`, `username`, and `password`. |
| `includeCalendars` | Optional array of calendar names to include. Empty means all calendars. |
| `updateInterval` | Refresh interval in milliseconds. Default: 10 min. The long-press toggle renders optimistically and triggers its own refresh, so it does not need a short interval. |
| `backgroundRefresh` | Keep refreshing while the module is hidden (e.g. under MMM-Carousel). Default `true`, so showing the module never causes a request. With `false`, the backend pauses while every display hides the module. |
| `quietHours` | Optional window without any polling, e.g. `{ from: "23:00", to: "06:00" }`. |
| `sortMethod` | Sorting mode: `priority`, `priority desc`, `created`, `created desc`, `modified`, `modified desc`. A manual order you set by dragging tasks in Apple Reminders or the Nextcloud Tasks app (`X-APPLE-SORT-ORDER`) takes precedence; `sortMethod` orders the tasks without one. Tasks without a creation/modification date sort last. |
| `headings` | Optional array of headings for grouped output. |
| `toggleTime` | Long-press time in milliseconds before a task is toggled. |
| `requestTimeout` | Timeout in milliseconds for each CalDAV request in the backend (login, calendar list, calendar objects) and for a whole toggle. Default: 30 s. |
| `frontendTimeout` | Time in milliseconds after which the module shows "Request Timeout" if the very first load got no answer. Later refreshes keep the previous data. Default: 60 s. |

## Filtering And Visibility

| Option | Description |
| --- | --- |
| `startsInDays` | Show tasks starting within this number of days. |
| `dueInDays` | Show tasks due within this number of days. |
| `showWithoutStart` | Show tasks that have no start date. |
| `showWithoutDue` | Show tasks that have no due date. |
| `hideCompletedTasksAfter` | Hide completed tasks after the given number of days. |
| `completedTaskGracePeriod` | Seconds a just-completed task stays visible (with a countdown bar) even if `hideCompletedTasksAfter` would already hide it. Only has an effect when `hideCompletedTasksAfter` is shorter than the grace period, i.e. in practice with `hideCompletedTasksAfter: 0`; with the default `1` a completed task stays for a day anyway. Default `60`, `0` turns it off. |
| `hideDateSectionOnCompletion` | Hide the date section once a task is completed. |

## Display Options

| Option | Description |
| --- | --- |
| `displayStartDate` | Show task start dates. |
| `displayDueDate` | Show task due dates. |
| `dateFormat` | Output format for displayed dates using Moment.js tokens. Dates within a week are shown relative ("tomorrow", "2 days ago") in the MagicMirror language instead; all-day tasks drop the time tokens. |
| `colorize` | Colorize icons based on task priority. |
| `showCompletionPercent` | Show completion progress as a percentage. |
| `highlightStartedTasks` | Highlight tasks that have already started. |
| `highlightOverdueTasks` | Highlight overdue tasks. |
| `pieChartBackgroundColor` | Background color for the completion pie chart. |
| `pieChartColor` | Foreground color for the completion pie chart. |
| `pieChartSize` | Pie-chart size in pixels. |

## Data Normalization

| Option | Description |
| --- | --- |
| `mapEmptyPriorityTo` | Fallback priority value for tasks without a priority. |
| `mapEmptySortIndexTo` | Fallback sort index for tasks without one. |
| `developerMode` | Development aid: shows the default mouse cursor on the mirror page. |
| `logLevel` | Optional: `none`, `error`, `warn`, `info` or `debug`. All output goes through MagicMirror's `Log`, so the global `logLevel` in `config.js` decides; this option can only narrow it for this module (e.g. `"warn"` with global `DEBUG`). Unset means the global level alone. Applies per instance, in the browser console and in the backend (`pm2 logs`). Backend lines without an instance (CalDAV login fallback, write errors) follow the global level. |

## Styling Hooks

Useful CSS selectors include:

- `.MMM-CalDAV-Tasks-wrapper`
- `.MMM-CalDAV-Tasks-Calendar-wrapper` (carries the calendar color as `--calendar-color`)
- `.MMM-CalDAV-Tasks-Calendar-Header`, `.MMM-CalDAV-Tasks-Count`
- `.MMM-CalDAV-Tasks-List-Item`
- `.MMM-CalDAV-Tasks-Date-Section`, `.MMM-CalDAV-Tasks-Badge`
- `.MMM-CalDAV-Tasks-Completed`
- `.MMM-CalDAV-Tasks-Started`
- `.MMM-CalDAV-Tasks-Overdue`, `.MMM-CalDAV-Tasks-Due-today`, `.MMM-CalDAV-Tasks-Due-soon`
- `.MMM-CalDAV-Tasks-Empty`
- `.MMM-CalDAV-Tasks-Press-Progress` (fills while a long press is held)
- `.MMM-CalDAV-Tasks-Toggle-Flash`

The module arranges calendars side by side and wraps them when the position runs
out of width, so a `custom.css` that forces `width`/`display: inline-block` on
`.MMM-CalDAV-Tasks-Calendar-wrapper` is no longer needed.

If you need full CLI and troubleshooting support while adjusting your config, continue with [CLI Debug](CLI-Debug) or [Troubleshooting](Troubleshooting).