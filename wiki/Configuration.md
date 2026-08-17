# Configuration

## Core Options

| Option | Description |
| --- | --- |
| `webDavAuth` | Required authentication object with `url`, `username`, and `password`. |
| `includeCalendars` | Optional array of calendar names to include. Empty means all calendars. |
| `updateInterval` | Refresh interval in milliseconds. Default: 10 min. The long-press toggle renders optimistically and triggers its own refresh, so it does not need a short interval. |
| `backgroundRefresh` | Keep refreshing while the module is hidden (e.g. under MMM-Carousel). Default `true`, so showing the module never causes a request. |
| `quietHours` | Optional window without any polling, e.g. `{ from: "23:00", to: "06:00" }`. |
| `sortMethod` | Sorting mode such as `priority`, `priority desc`, `created`, `modified desc`. |
| `headings` | Optional array of headings for grouped output. |
| `toggleTime` | Long-press time in milliseconds before a task is toggled. |

## Filtering And Visibility

| Option | Description |
| --- | --- |
| `startsInDays` | Show tasks starting within this number of days. |
| `dueInDays` | Show tasks due within this number of days. |
| `showWithoutStart` | Show tasks that have no start date. |
| `showWithoutDue` | Show tasks that have no due date. |
| `hideCompletedTasksAfter` | Hide completed tasks after the given number of days. |
| `hideDateSectionOnCompletion` | Hide the date section once a task is completed. |

## Display Options

| Option | Description |
| --- | --- |
| `displayStartDate` | Show task start dates. |
| `displayDueDate` | Show task due dates. |
| `dateFormat` | Output format for displayed dates using Moment.js tokens. |
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
| `developerMode` | Load external Font Awesome in development setups where local icon loading fails. |

## Styling Hooks

Useful CSS selectors include:

- `.MMM-CalDAV-Tasks-wrapper`
- `.MMM-CalDAV-Tasks-List-Item`
- `.MMM-CalDAV-Tasks-Date-Section`
- `.MMM-CalDAV-Tasks-Completed`
- `.MMM-CalDAV-Tasks-Started`
- `.MMM-CalDAV-Tasks-Overdue`
- `.MMM-CalDAV-Tasks-Toggle-Flash`

If you need full CLI and troubleshooting support while adjusting your config, continue with [CLI Debug](CLI-Debug) or [Troubleshooting](Troubleshooting).