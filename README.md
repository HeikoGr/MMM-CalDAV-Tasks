# MMM-CalDAV-Tasks

This is a module for the [MagicMirror²](https://github.com/MichMich/MagicMirror/). Originally developed by [SoulofN00b](https://github.com/SoulOfNoob/MMM-CalDAV-Tasks/), further developed by [Starlingfire](https://github.com/starlingfire/MMM-CalDAV-Tasks). I have forked it and added new features.

This module loads a ToDo list via CalDAV (e.g. from the NextCloud Tasks app using the "private link" and [Nextcloud Managed Devices](https://docs.nextcloud.com/server/latest/user_manual/en/session_management.html#managing-devices) )

You can toggle the status of the task via longpress / long touch and it will be sent to the Server.

Current development status: **released** \
![Small Screenshot](/assets/small_screenshot.png?raw=true)

## Dependencies

- Working CalDAV Server (e.g. NextCloud with installed Tasks app)

## CalDAV preparations

1. Create a new app password in your NextCloud installation at Settings > Security (under Personal) > Create New App Password
2. Give your app a name and generate the password: \
![App password screenshot](/assets/create-app-password.png?raw=true)
3. Create the Private Link to the ToDo list you want to display like this: \
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

To use this module, add the following configuration block to the modules array in the `config/config.js` file:

```js
var config = {
    modules: [
        {
            module: 'MMM-CalDAV-Tasks',
            config: {
                // See 'Configuration options' for more information.
                updateInterval: 60000,
                listUrl: [
					"<CalDAV_TASKS_PRIVATE_LINK_1>",
					"<CalDAV_TASKS_PRIVATE_LINK_2>",
				],
                hideCompletedTasks: true,
                sortMethod: "<SORT_METHOD>",
                colorize: true,
                startsInDays: 14,
                displayStartDate: true,
                dueInDays: 14,
                displayDueDate: true,
                showCompletionPercent: true,
                pieChartColor: "white", 
                showWithoutStart: true,
                showWithoutDue: true,
                dateFormat: "DD.MM.YYYY", 
                webDavAuth: {
                    username: "<CalDAV_APP_USERNAME>",
                    password: "<CalDAV_APP_PASSWORD>",
                }
            }
        }
    ]
}
```

## Configuration options

| Option               | Description
|----------------------|-----------
| `listUrl`            | *Required*: "Private Link" url from your desired CalDAV task-list. Supports an array of urls from the *same* CalDAV instance
| `webDavAuth`         | *Required*: WebDav Authentication object consisting of username and password. <br> Example: `{username: "<CalDAV_APP_USERNAME>", password: "<CalDAV_APP_PASSWORD>",}`
| `toggleTime`         | *Optional*: How long do you need to click / touch the task list item to toggle it. Default `1600` (1.6 seconds)
| `updateInterval`     | *Optional*: How often should the data be refreshed (in milliseconds)
| ~~`hideCompletedTasks`~~ | ~~*Optional*: should completed tasks show up or not~~
| `sortMethod`         | *Optional*: How to sort tasks. Options: "priority" "priority desc" "created" "created desc" "modified" "modified desc"
| `colorize`           | *Optional*: Should the icons be colorized based on priority?
| `startsInDays`       | *Optional*: Filter tasks which start within x days. Default `999999`. *see note
| `dueInDays`          | *Optional*: Filter tasks which are due within x days. Default `999999` *see note
| `displayStartDate`   | *Optional*: Should the start date of tasks be displayed? Default `true`
| `displayDueDate`     | *Optional*: Should the due date of tasks be displayed? Default `true`
| `showWithoutStart`   | *Optional*: Should tasks without a start date be shown? Default `true`
| `showWithoutDue`     | *Optional*: Should tasks without a due date be shown? Default `true`
| `dateFormat`         | *Optional*: Format for displaying dates. Default `DD.MM.YYYY` Uses [moment.js formats](https://momentjs.com/docs/#/displaying/format/)  
| `showCompletionPercent`     | *Optional*: Shows the percentage of completion. Default `false`
| `pieChartColor`      | *Optional*: Color of the pie chart. Accepts named colors, hex codes, rgb(), rgba(), hsl(), hsla(). Default `white`
| `pieChartBackgroundColor`| *Optional*: Color of the pie chart. Accepts named colors, hex codes, rgb(), rgba(), hsl(), hsla(). Default `rgb(63, 63, 63)` (a really dark grey)
| `pieChartSize`       | *Optional*: Size of the pie chart in pixels. No relative values! Default `16`
| `highlightStartedTasks` | *Optional*: Highlights tasks that have already started. Default `true` |
| `highlightOverdueTasks` | *Optional*: Highlights tasks that are overdue. Default `true` |
| `showCompletionPercent`     | *Optional*: Shows the percentage of completion. Default `false` |
| `pieChartColor`             | *Optional*: Color of the pie chart. Accepts named colors, hex codes, rgb(), rgba(), hsl(), hsla(). Default `white`. Example: `rgb(255, 255, 255)` (white) |
| `pieChartBackgroundColor`   | *Optional*: Background color of the pie chart. Accepts named colors, hex codes, rgb(), rgba(), hsl(), hsla(). Default `rgb(63, 63, 63)` (a really dark grey). Example: `rgb(138, 138, 138)` (grey) |
| `pieChartSize`              | *Optional*: Size of the pie chart in pixels. No relative values! Default `16`. Example: `16` |
| `hideDateSectionOnCompletion` | *Optional*: Hides the date section of a task once it is completed. Default `true` |
| `developerMode`             | *Optional*: When developing under Windows the Fontawesome Icons do not load. This just embeds Fontawesome from an external source. Default `false` |

### The glow effect bug:
When you toggle a task there is a glow effect which strangely was offset on windows but not on a Raspberry Pi - or maybe it was the different screen. You will know what I mean if you see that there is s.th. wrong with the effect.
| `developerMode`      | *Optional*: When developing under Windows the Fontawesome Icons do not load. This just embeds Fontawesome from an external source. Default `false`

If you do not see the effect at all this is likely due to another module. For instance I wanted my calendar module to download a public holidays calendar from the internet resulting in hundreds of errors per minute. Removing that calendar solved it.

### 🐞General bug handling:
See my example some lines above how fast a bug comes from another module. Go to your Magic Mirror folder and `npm run start:dev` to chase the bugs!

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
![Module Screenshot](/assets/small_screenshot.png?raw=true)

Sorting on "modified desc" \
![Module Screenshot 2](/assets/demo_screenshot_2.png?raw=true)

Non-colorized \
![Module Screenshot 2](/assets/demo_screenshot_3.png?raw=true)

