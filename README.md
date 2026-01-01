# MMM-CalDAV-Tasks

This is a module for the [MagicMirror²](https://github.com/MichMich/MagicMirror/). Originally developed by [SoulofN00b](https://github.com/SoulOfNoob/MMM-CalDAV-Tasks/), further developed by [Starlingfire](https://github.com/starlingfire/MMM-CalDAV-Tasks). I have forked it and added new features.

This module loads a ToDo list via CalDAV (e.g. from the NextCloud Tasks app using the "private link" and [Nextcloud Managed Devices](https://docs.nextcloud.com/server/latest/user_manual/en/session_management.html#managing-devices) )

You can toggle the status of the task via longpress / long touch and it will be sent to the Server.

Current development status: **released** \
![Small Screenshot](/assets/small_screenshot.png?raw=true)

## ⚡ Recent Updates (January 2026)

**Version 1.2.0 - Refactored & Enhanced**

- ✅ **Improved Error Handling:** Better error messages with specific guidance (e.g., "Use app password!")
- ✅ **Enhanced Config Validation:** Automatic type checking, range validation, and helpful error messages
- ✅ **Modularized Code:** Extracted reusable utilities (date-utils, config-validator, error-handler)
- ✅ **Better Defaults:** Missing config options are automatically filled with sensible defaults
- ✅ **Code Quality:** 29/29 unit tests passing, ESLint compliant, fully documented

For developers: See [UTILITIES.md](UTILITIES.md) for utility module documentation and [REFACTORING_REPORT.md](REFACTORING_REPORT.md) for technical details.

## Dependencies

- Working CalDAV Server (e.g. NextCloud with installed Tasks app)

## NextCloud preparations
> [!WARNING]
> While you could login with your normal NextCloud credentials, you should generate a new app password for performance reasons (https://help.nextcloud.com/t/very-high-latency-on-card-cal-webdav-due-to-http-authorization-basic/200107)

1. Create a new app password in your NextCloud installation at Settings > Security (under Personal) > Create New App Password\
3. Give your app a name and generate the password: \
![App password screenshot](/assets/create-app-password.png?raw=true)
4. Create the Private Link to the ToDo list you want to display like this: \
![Tasks Screenshot](/assets/generate_private_link.png?raw=true)

## Installing the module

```sh
cd ~/MagicMirror/modules
git clone https://github.com/Coernel82/MMM-CalDAV-Tasks
cd MMM-CalDAV-Tasks
npm install
```

## Updating the module
From `MagicMirror/modules/MMM-CalDAV-Tasks` use `git pull`

## Using the module

To use this module, add the following most important settings in the configuration block to the modules array in the `config/config.js` file:

```javascript
var config = {
    modules: [
        {
            module: 'MMM-CalDAV-Tasks',
            config: {
                // See 'Configuration options' for more information.

                webDavAuth: {
                    url: "<CalDAV_URL>",
                    username: "<CalDAV_APP_USERNAME>",
                    password: "<CalDAV_APP_PASSWORD>",
                }
                includeCalendars: [], //optional - match calendar names
                updateInterval: 60000
            }
        }
    ]
}
```

## Configuration options

| Option               | Description
|----------------------|-----------
| `webDavAuth`         | *Required*: WebDav Authentication object consisting of username and password. <br> Example: `{url: "<URL>, username: "<CalDAV_APP_USERNAME>", password: "<CalDAV_APP_PASSWORD>",}`
| `includeCalendars`  | *Optional*: Array of calendar names to include. Default is set to `[]` and includes all calendars.
| `updateInterval`     | *Optional*: How often should the data be refreshed (in milliseconds)
| `sortMethod`         | *Optional*: How to sort tasks. Options: "priority" "priority desc" "created" "created desc" "modified" "modified desc"
| `colorize`           | *Optional*: Should the icons be colorized based on priority?
| `startsInDays`       | *Optional*: Filter tasks which start within x days. Default `999999`. *see note
| `dueInDays`          | *Optional*: Filter tasks which are due within x days. Default `999999` *see note
| `displayStartDate`   | *Optional*: Should the start date of tasks be displayed? Default `true`
| `displayDueDate`     | *Optional*: Should the due date of tasks be displayed? Default `true`
| `showWithoutStart`   | *Optional*: Should tasks without a start date be shown? Default `true`
| `showWithoutDue`     | *Optional*: Should tasks without a due date be shown? Default `true`
| `hideCompletedTasksAfter ` | *Optional*: How many days after completion should tasks be hidden? Default `1`
| `dateFormat`         | *Optional*: Format for displaying dates. Default `DD.MM.YYYY` Uses [moment.js formats](https://momentjs.com/docs/#/displaying/format/)
| `headings`         | *Optional*: Array of headings for the tasks.
| `playsound`         | *Optional*: Should a sound be played when a task is toggled? Default `true`
| `offsetTop`             | *Optional*: Offset of the module in pixels. Default `0`
| `offsetLeft`             | *Optional*: Offset of the module in pixels. Default `0`
| `toggleTime`         | *Optional*: How long do you need to click / touch the task list item to toggle it. Default `1600` (1.6 seconds)
| `showCompletionPercent`     | *Optional*: Shows the percentage of completion. Default `false`
| `mapEmptyPriorityTo`     | *Optional*: Map empty priority to a value. Default `5`
| `mapEmptySortIndexTo`     | *Optional*: Map empty sort index to a value. Default `999999`
| `highlightStartedTasks` | *Optional*: Highlights tasks that have already started. Default `true` |
| `highlightOverdueTasks` | *Optional*: Highlights tasks that are overdue. Default `true` |
| `pieChartBackgroundColor`| *Optional*: Color of the pie chart. Accepts named colors, hex codes, rgb(), rgba(), hsl(), hsla(). Default `rgb(63, 63, 63)` (a really dark grey)
| `pieChartColor`      | *Optional*: Color of the pie chart. Accepts named colors, hex codes, rgb(), rgba(), hsl(), hsla(). Default `white`
| `pieChartSize`       | *Optional*: Size of the pie chart in pixels. No relative values! Default `16`
| `hideDateSectionOnCompletion` | *Optional*: Hides the date section of a task once it is completed. Default `true` |
| `developerMode`             | *Optional*: When developing under Windows the Fontawesome Icons do not load. This just embeds Fontawesome from an external source. Default `false` |
| ~~`hideCompletedTasks`~~ | ~~*Optional*: should completed tasks show up or not~~

### The glow effect bug:
When you toggle a task there is a glow effect which strangely was offset on windows but not on a Raspberry Pi - or maybe it was the different screen. You will know what I mean if you see that there is s.th. wrong with the effect.
| `developerMode`      | *Optional*: When developing under Windows the Fontawesome Icons do not load. This just embeds Fontawesome from an external source. Default `false`

If you do not see the effect at all this is likely due to another module. For instance I wanted my calendar module to download a public holidays calendar from the internet resulting in hundreds of errors per minute. Removing that calendar solved it.

### 🐞General bug handling:
See my example some lines above how fast a bug comes from another module. Go to your Magic Mirror folder and `npm run start:dev` to chase the bugs!

### 🛠️ CLI Debug Tool

For testing and debugging the module from the command line, use the built-in CLI tool:

```sh
# Validate configuration
node --run debug:config

# Fetch tasks from CalDAV server
node --run debug:fetch

# Toggle task status
node cli-debug.js toggle <task-uid>

# Show help
node --run debug:help
```

The CLI tool lets you test the module functionality without running MagicMirror². Perfect for:
- Debugging connection issues
- Validating configuration
- Testing CalDAV server access
- Managing tasks from the command line

📖 See [CLI-DEBUG.md](CLI-DEBUG.md) for detailed documentation.

### Note:
If both conditions `startsInDays`and `dueInDays`are set both are checked after each other. So when one or both conditions are true the task will be shown.
If you get a *WebDav: Unknown error!* just wait for the next `updateInterval`. It is likely that you fetch your calendar as well from your CalDAV. My suspicion is that there are too many server requests at the same time. Also, it might be a good idea to use all different prime numbers as `fetchInterval` for your calendar and here for this module (called `updateInterval`) as this minimizes the occurrence of fetching the data at the same time. You can find a list of prime numbers [here](http://compoasso.free.fr/primelistweb/page/prime/liste_online_en.php).

### Individual styling
| Class Name                              | Purpose                                                                                       |
|-----------------------------------------|-----------------------------------------------------------------------------------------------|
| .MMM-CalDAV-Tasks-wrapper            | Serves as the main container for the module, wrapping all task-related elements.              |
| .MMM-CalDAV-Tasks-wrapper ul         | Styles unordered lists within the module to manage the layout of task items.                  |
| .MMM-CalDAV-Tasks-wrapper > ul       | Specifically targets top-level unordered lists directly under the main wrapper for additional styling. |
| .MMM-CalDAV-Tasks-Toplevel           | Applies styles to top-level task items, distinguishing them from sub-tasks.                   |
| .MMM-CalDAV-Tasks-List-Item           | Styles individual task list items, allowing for customization of each task's appearance.      |
| .MMM-CalDAV-Tasks-Date-Section       | Styles the section that displays the start and due dates of tasks.                            |
| .MMM-CalDAV-Tasks-StartDate          | Specifically styles the start date of a task to differentiate it from other text.             |
| .MMM-CalDAV-Tasks-DueDate            | Specifically styles the due date of a task, making it easily identifiable.                    |
| .MMM-CalDAV-Tasks-List-Item > div     | Styles the inner <div> elements within each task list item, enabling interactive features like hover effects. |
| .MMM-CalDAV-Tasks-Heading-0, .MMM-CalDAV-Tasks-Heading-1, .MMM-CalDAV-Tasks-Heading-2 | Styles for different heading levels within the module, allowing for hierarchical organization of tasks. |
| .MMM-CalDAV-Tasks-SubList            | Styles sublists within task items, useful for organizing sub-tasks under main tasks.          |
| .MMM-CalDAV-Tasks-Priority-1 to .MMM-CalDAV-Tasks-Priority-9 | Applies color coding based on task priority levels, helping to visually distinguish tasks by their urgency or importance. |
| .MMM-CalDAV-Tasks-Completed          | Styles completed tasks, typically by reducing opacity and adding a strikethrough to indicate completion. |
| .MMM-CalDAV-Tasks-Started           | Styles tasks that have already started, making them visually distinct.                        |
| .MMM-CalDAV-Tasks-Overdue           | Styles overdue tasks, highlighting them to indicate urgency.                                 |
## Screenshots

Sorting on "priority" \
![module screenshot 1](/assets/small_screenshot.png?raw=true)

Sorting on "modified desc" \
![module screenshot 2](/assets/demo_screenshot_2.png?raw=true)

Non-colorized \
![module screenshot 3](/assets/demo_screenshot_3.png?raw=true)

example with multiple calendars \
![multiple calendars](/assets/example.png?raw=true)