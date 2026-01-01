# CLI Debug Tool - Documentation

The CLI Debug Tool allows testing the MMM-CalDAV-Tasks module from the command line without running MagicMirror².

## Features

- ✅ Validate configuration
- ✅ Fetch tasks from CalDAV server
- ✅ Toggle task completion status
- ✅ Beautiful, filtered output
- ✅ Hide completed tasks by default
- ✅ Display RRule (recurring task) information
- ✅ Optional display of UIDs and filenames
- ✅ Verbose mode for additional details

---

## Installation

The tool is already included in the module. No additional installation required.

---

## Usage

### Basic Commands

```bash
# Navigate to module directory
cd /opt/magic_mirror/modules/MMM-CalDAV-Tasks

# Show help
node cli-debug.js help

# Validate configuration
node cli-debug.js test-config

# Fetch tasks
node cli-debug.js fetch

# Toggle task status
node cli-debug.js toggle <uid>
```

### NPM Scripts

For convenience, npm scripts are available:

```bash
npm run debug:help        # Show help
npm run debug:config      # Test configuration
npm run debug:fetch       # Fetch tasks
```

---

## Commands

### `help`

Displays help and usage information.

```bash
node cli-debug.js help
```

**Output:**
```
📘 MMM-CalDAV-Tasks CLI Debug Tool

Usage: node cli-debug.js <command> [options]

Commands:
  help              Show this help message
  test-config       Validate configuration file
  fetch             Fetch and display all tasks
  toggle <uid>      Toggle task completion status by UID

Options:
  --config <path>      Path to config file (default: ./config/config.js)
  --show-completed     Show completed tasks (default: hidden)
  --show-file          Show task filenames
  --show-uid           Show task UIDs
  --verbose, -v        Show additional details (start dates, descriptions)
```

---

### `test-config`

Validates the configuration file using the config-validator module.

```bash
node cli-debug.js test-config
```

**Example output:**
```
🚀 MMM-CalDAV-Tasks CLI Debug Tool

✅ Configuration loaded successfully
   Server: https://nc.example.com/
   User: johndoe

🔍 Testing Configuration...

✅ Configuration is valid!

📋 Normalized Config:
{
  "webDavAuth": {
    "url": "https://nc.example.com/remote.php/dav/",
    "username": "johndoe",
    "password": "***"
  },
  "updateInterval": 60000,
  "sortMethod": "priority",
  "colorize": false,
  ...
}
```

**Error output:**
```
❌ Configuration has errors:

  1. [error] webDavAuth.url is required
  2. [error] updateInterval must be >= 1000 (got 500)
  3. [warning] sortMethod "date" is deprecated, use "priority-date"
```

---

### `fetch`

Fetches tasks from the CalDAV server and displays them.

```bash
node cli-debug.js fetch [options]
```

**Options:**
- `--show-completed` - Show completed tasks (hidden by default)
- `--show-uid` - Display task UIDs
- `--show-file` - Display task filenames
- `--verbose` / `-v` - Show additional details

**Example output (default):**
```
🚀 MMM-CalDAV-Tasks CLI Debug Tool

✅ Configuration loaded successfully
   Server: https://nc.example.com/
   User: johndoe

📥 Fetching tasks from CalDAV server...

✅ Successfully fetched 37 tasks from 3 calendar(s)
   Active: 5 | Completed: 32 (hidden)

📅 Calendar 1: Work
   URL: https://nc.example.com/remote.php/dav/calendars/johndoe/work/
   Color: #4CAF50
   Tasks: 3

   📝 Tasks (3):

      1. ⬜ Review pull request [P1]
          📅 Due: 05.01.2026 ⚠️ OVERDUE

      2. ⬜ Team meeting [P3]
          📅 Due: 08.01.2026

      3. ⬜ Update documentation [P5]
          🔁 Repeats: Every weekly

📅 Calendar 2: Personal
   URL: https://nc.example.com/remote.php/dav/calendars/johndoe/personal/
   Color: #2196F3
   Tasks: 2

   📝 Tasks (2):

      1. ⬜ Pay bills [P1]
          📅 Due: 10.01.2026

      2. ⬜ Doctor appointment [P2]
          📅 Due: 15.01.2026
          🏁 Started: 01.01.2026
```

**Example output (verbose with completed):**
```bash
node cli-debug.js fetch --show-completed --verbose
```

```
📅 Calendar 1: Work
   Tasks: 10

   📝 Tasks (10):

      1. ⬜ Review pull request [P1]
          📅 Due: 05.01.2026 ⚠️ OVERDUE
          🏁 Started: 01.01.2026
          💬 Review the new authentication feature...

      2. ✅ Complete project setup [P1]
          📅 Due: 28.12.2025
          💬 Setup development environment

      ...
```

**Example output (with UIDs and files):**
```bash
node cli-debug.js fetch --show-uid --show-file
```

```
   📝 Tasks (1):

      1. ⬜ Pay bills [P1]
          📅 Due: 10.01.2026
          🔑 UID: A1B2C3D4-E5F6-G7H8-I9J0-K1L2M3N4O5P6
          📄 File: https://nc.example.com/remote.php/dav/calendars/johndoe/personal/A1B2C3D4.ics
```

---

### `toggle <uid>`

Toggles the completion status of a task.

```bash
node cli-debug.js toggle <uid>
```

**Parameters:**
- `<uid>` - The UID of the task to toggle

**Example:**
```bash
node cli-debug.js toggle A1B2C3D4-E5F6-G7H8-I9J0-K1L2M3N4O5P6
```

**Output:**
```
🚀 MMM-CalDAV-Tasks CLI Debug Tool

✅ Configuration loaded successfully
   Server: https://nc.example.com/
   User: johndoe

🔄 Toggling task: A1B2C3D4-E5F6-G7H8-I9J0-K1L2M3N4O5P6...

📝 Found task: Pay bills
   Status: IN-PROGRESS
   Filename: https://nc.example.com/remote.php/dav/.../A1B2C3D4.ics

✅ Task toggled successfully!
   New status: COMPLETED

🔄 Fetching updated tasks...

✅ Successfully fetched 37 tasks from 3 calendar(s)
   Active: 4 | Completed: 33 (hidden)
```

**Error handling:**
```bash
node cli-debug.js toggle invalid-uid
```

```
❌ Task with UID invalid-uid not found

💡 Tip: Run "node cli-debug.js fetch --show-uid" to see all available UIDs
```

---

## Configuration

### Config File

By default, the tool reads configuration from `config/config.js`.

**Supported formats:**

1. **MagicMirror config.js:**
   ```javascript
   let config = {
     modules: [
       {
         module: "MMM-CalDAV-Tasks",
         config: {
           webDavAuth: {
             url: "https://nc.example.com/remote.php/dav/",
             username: "johndoe",
             password: "app-password"
           },
           updateInterval: 60000
         }
       }
     ]
   };
   ```

2. **Standalone config file:**
   ```javascript
   {
     webDavAuth: {
       url: "https://nc.example.com/remote.php/dav/",
       username: "johndoe",
       password: "app-password"
     },
     updateInterval: 60000
   }
   ```

### Custom Config Path

Use the `--config` option to specify a custom config file:

```bash
node cli-debug.js fetch --config /path/to/custom-config.js
```

---

## Output Formatting

### Task Display

**Active task:**
```
⬜ Task summary [P1]
    📅 Due: 10.01.2026
    🔁 Repeats: Every weekly
```

**Completed task (with --show-completed):**
```
✅ Task summary [P1]
    📅 Due: 28.12.2025
```

**Overdue task:**
```
⬜ Task summary [P1]
    📅 Due: 28.12.2025 ⚠️ OVERDUE
```

### Icons

- ⬜ - Incomplete task
- ✅ - Completed task
- 📅 - Due date
- 🏁 - Start date
- 🔁 - Recurring task
- 💬 - Description
- 🔑 - UID
- 📄 - Filename
- ⚠️ - Overdue indicator

---

## Examples

### Daily Workflow

**Morning: Check tasks**
```bash
npm run debug:fetch
```

**Complete a task**
```bash
# 1. Fetch with UIDs
node cli-debug.js fetch --show-uid

# 2. Copy UID of completed task

# 3. Toggle status
node cli-debug.js toggle A1B2C3D4-E5F6-G7H8-I9J0-K1L2M3N4O5P6
```

**Review all tasks including completed**
```bash
node cli-debug.js fetch --show-completed --verbose
```

---

### Debugging

**Check configuration after changes**
```bash
node cli-debug.js test-config
```

**Verify CalDAV connection**
```bash
node cli-debug.js fetch --verbose
```

**Find specific task**
```bash
node cli-debug.js fetch --show-uid | grep "Task name"
```

---

## Troubleshooting

### Common Errors

**1. Config file not found**
```
❌ Config file not found: ./config/config.js

💡 Tip: Create config/config.js from config/config.template.js
```

**Solution:**
```bash
cp config/config.template.js config/config.js
# Edit config.js with your settings
```

---

**2. Module not found in config**
```
❌ MMM-CalDAV-Tasks module not found in config file

💡 Tip: Make sure the module is configured in config.js
```

**Solution:** Add the module to your MagicMirror config.js

---

**3. Authentication failed**
```
❌ Error fetching tasks: Authentication failed
```

**Solution:**
- Check username and password in config
- Use app password instead of account password
- Verify CalDAV URL is correct

---

**4. Network error**
```
❌ Error fetching tasks: Network error
```

**Solution:**
- Check internet connection
- Verify CalDAV server URL
- Check firewall settings

---

## Advanced Usage

### Environment Variables

Enable debug mode for detailed error messages:

```bash
DEBUG=1 node cli-debug.js fetch
```

### Filtering Output

**Show only overdue tasks:**
```bash
node cli-debug.js fetch | grep "OVERDUE"
```

**Count active tasks:**
```bash
node cli-debug.js fetch | grep "Active:" | awk '{print $2}'
```

**Export task list:**
```bash
node cli-debug.js fetch --show-completed > tasks.txt
```

---

## Technical Details

### Dependencies

The CLI tool uses the following modules:
- `config-validator.js` - Configuration validation
- `error-handler.js` - Error handling
- `webDavHelper.js` - CalDAV communication
- `transformer.js` - Data transformation
- `vtodo-completer.js` - Task completion logic
- `date-utils.js` - Date formatting (indirectly via vtodo-completer)

### Architecture

```
cli-debug.js
    ├── loadConfig()           - Loads and parses config file
    ├── testConfig()           - Validates config using config-validator
    ├── fetchTasks()           - Fetches tasks via webDavHelper
    │   ├── validateConfig()   - Normalizes config
    │   ├── fetchCalendarData() - Gets raw CalDAV data
    │   ├── transformData()    - Transforms to task format
    │   └── Display output     - Formatted console output
    └── toggleTask(uid)        - Toggles task status
        ├── fetchTasks()       - Find task by UID
        ├── VTodoCompleter     - Complete task via CalDAV
        └── fetchTasks()       - Show updated list
```

---

## See Also

- [UTILITIES.md](UTILITIES.md) - Utility modules documentation
- [REFACTORING_REPORT.md](REFACTORING_REPORT.md) - Refactoring details
- [README.md](README.md) - Main module documentation

---

## License

MIT License - Same as MMM-CalDAV-Tasks module
