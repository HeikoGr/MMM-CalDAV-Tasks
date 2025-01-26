# MMM-NextCloud-Tasks

This is a module for the [MagicMirror²](https://github.com/MichMich/MagicMirror/). Originally developed by [SoulofN00b](https://github.com/SoulOfNoob/MMM-NextCloud-Tasks/), I have forked it to resolve bugs and add new features.

This module loads a ToDo list via webDav from the NextCloud Tasks app using the "private link" and [NextCloud Managed Devices](https://docs.nextcloud.com/server/latest/user_manual/en/session_management.html#managing-devices)

You can toggle the status of the task via longpress / long touch and it will be sent to the Server.

Current development status: **released** \
![Small Screenshot](/assets/small_screenshot.png?raw=true)

## Dependencies

- Working NextCloud installation
- Installed Tasks app

## NextCloud preparations

1. Create a new app password in your Nextcloud installation at Settings > Security (under Personal) > Create New App Password
2. Give your app a name and generate the password: \
![App password screenshot](/assets/create-app-password.png?raw=true)
3. Create the Private Link to the ToDo list you want to display like this: \
![Tasks Screenshot](/assets/generate_private_link.png?raw=true)

## Installing the module

1. Navigate to your local `MagicMirror/modules` directory
2. run `git clone https://github.com/starlingfire/MMM-NextCloud-Tasks.git`
3. `cd MMM-NextCloud-Tasks`
4. run `npm install` to install dependencies. (This could take several minutes because of the WebDav module)

## Updating the module
From `MagicMirror/modules/MMM-Nextcloud-Tasks` use `git pull`

## Using the module

To use this module, add the following configuration block to the modules array in the `config/config.js` file:

```js
var config = {
    modules: [
        {
            module: 'MMM-NextCloud-Tasks',
            config: {
                // See 'Configuration options' for more information.
                updateInterval: 60000,
                listUrl: [
					"<NEXTCLOUD_TASKS_PRIVATE_LINK_1>",
					"<NEXTCLOUD_TASKS_PRIVATE_LINK_2>",
				],
                hideCompletedTasks: true,
                sortMethod: "<SORT_METHOD>",
                colorize: true,
                startsInDays: 14,
                displayStartDate: true,
                dueInDays: 14,
                displayDueDate: true,
                showWithoutStart: true,
                showWithoutDue: true,
                dateFormat: "DD.MM.YYYY", 
                webDavAuth: {
                    username: "<NEXTCLOUD_APP_USERNAME>",
                    password: "<NEXTCLOUD_APP_PASSWORD>",
                }
            }
        }
    ]
}
```

## Configuration options

| Option               | Description
|----------------------|-----------
| `listUrl`            | *Required*: "Private Link" url from your desired NextCloud task-list. Supports an array of urls from the *same* Nextcloud instance
| `webDavAuth`         | *Required*: WebDav Authentication object consisting of username and password. <br> Example: `{username: "<NEXTCLOUD_APP_USERNAME>", password: "<NEXTCLOUD_APP_PASSWORD>",}`
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


### Note:
If both conditions `startsInDays`and `dueInDays`are set both are checked after each other. So when one or both conditions are true the task will be shown.
If you get a *WebDav: Unknown error!* just wait for the next `updateInterval`. It is likely that you fetch your calendar as well from your Nextcloud. My suspicion is that there are too many server requests at the same time. Also, it might be a good idea to use all different prime numbers as `fetchInterval` for your calendar and here for this module (called `updateInterval`) as this minimizes the occurrence of fetching the data at the same time. You can find a list of prime numbers [here](http://compoasso.free.fr/primelistweb/page/prime/liste_online_en.php).

### The glow effect bug:
When you toggle a task there is a glow effect which strangely was offset on windows but not on a Raspberry Pi - or maybe it was the different screen. You will know what I mean if you see that there is s.th. wrong with the effect.
If that is the case use `offsetTop`and `offsetLeft` (in pixels, default is 0) in the settings to fix it.

## Screenshots

Sorting on "priority" \
![Module Screenshot](/assets/small_screenshot.png?raw=true)

Sorting on "modified desc" \
![Module Screenshot 2](/assets/demo_screenshot_2.png?raw=true)

Non-colorized \
![Module Screenshot 2](/assets/demo_screenshot_3.png?raw=true)

