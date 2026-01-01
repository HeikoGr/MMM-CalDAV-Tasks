/**
 * CLI Debug Tool for MMM-CalDAV-Tasks
 *
 * Tests the node_helper functionality from command line
 * Usage: node cli-debug.js [command] [options]
 *
 * Commands:
 *   test-config    - Validate configuration
 *   fetch          - Fetch tasks from CalDAV server
 *   toggle <uid>   - Toggle task completion status
 *
 * Options:
 *   --config <path>  - Path to config file (default: ./config/config.js)
 */

/* eslint-disable n/no-process-exit */
// CLI tool requires process.exit() for proper exit codes

const fs = require("fs");
const path = require("path");

// Mock the MagicMirror NodeHelper module
class MockNodeHelper {
    constructor() {
        this.name = "MMM-CalDAV-Tasks";
    }

    sendSocketNotification() {
        // Mock method - not used in CLI tool
    }

    socketNotificationReceived() {
        // Will be overridden by actual helper
    }

    create() {
        return this;
    }
}

// Mock the node_helper module for require
const mockNodeHelperModule = {
    exports: MockNodeHelper
};

// Inject mock before requiring node_helper
require.cache["node_helper"] = mockNodeHelperModule;

// Load node_helper functions directly
const { transformData, sortList, appendUrlIndex } = require("./transformer");
const {
    parseList,
    mapEmptyPriorityTo,
    mapEmptySortIndexTo,
    fetchCalendarData,
    initDAVClient
} = require("./webDavHelper");
const VTodoCompleter = require("./vtodo-completer.js");
const { validateConfig } = require("./config-validator");

// Configuration
let config = null;
let configPath = path.join(__dirname, "config", "config.js");

// Parse command line arguments
const args = process.argv.slice(2);
const command = args[0] || "help";

// Parse flags
const flags = {
    showFile: args.includes("--show-file"),
    showUid: args.includes("--show-uid"),
    showCompleted: args.includes("--show-completed"),
    verbose: args.includes("--verbose") || args.includes("-v")
};

// Check for --config flag
const configIndex = args.indexOf("--config");
if (configIndex !== -1 && args[configIndex + 1]) {
    configPath = path.resolve(args[configIndex + 1]);
}

/**
 * Load configuration from file
 */
function loadConfig() {
    try {
        if (!fs.existsSync(configPath)) {
            console.error(`❌ Config file not found: ${configPath}`);
            console.log(
                "\n💡 Tip: Create config/config.js from config/config.template.js"
            );
            process.exit(1);
        }

        const configContent = fs.readFileSync(configPath, "utf8");

        // Check if it's a MagicMirror config file (contains 'modules:')
        if (configContent.includes("modules:")) {
            // Extract MMM-CalDAV-Tasks module config
            const moduleMatch = configContent.match(
                /module:\s*['"]MMM-CalDAV-Tasks['"]\s*,[\s\S]*?config:\s*(\{[\s\S]*?\})\s*,?\s*\}/
            );

            if (!moduleMatch) {
                console.error("❌ MMM-CalDAV-Tasks module not found in config file");
                console.log(
                    "\n💡 Tip: Make sure the module is configured in config.js"
                );
                process.exit(1);
            }

            // Parse the config object
            // Clean up JavaScript code for eval
            let configStr = moduleMatch[1];

            // Use safer function constructor
            const parseConfig = new Function(`return ${configStr}`);
            config = parseConfig();
        } else {
            // Standalone config file - extract the object
            const configMatch = configContent.match(/\{[\s\S]*\}/);
            if (!configMatch) {
                console.error("❌ Could not parse config file");
                process.exit(1);
            }

            config = eval(`(${configMatch[0]})`);
        }

        console.log("✅ Configuration loaded successfully");
        console.log("   Server:", config.webDavAuth?.url || "Not configured");
        console.log("   User:", config.webDavAuth?.username || "Not configured");

        return config;
    } catch (error) {
        console.error("❌ Error loading config:", error.message);
        if (process.env.DEBUG) {
            console.error("Stack trace:", error.stack);
        }
        process.exit(1);
    }
}

/**
 * Validate configuration using config-validator
 */
async function testConfig() {
    console.log("\n🔍 Testing Configuration...\n");

    const { valid, config: normalizedConfig, errors } = validateConfig(config);

    if (valid) {
        console.log("✅ Configuration is valid!\n");
        console.log("📋 Normalized Config:");
        console.log(JSON.stringify(normalizedConfig, null, 2));
    } else {
        console.log("❌ Configuration has errors:\n");

        errors.forEach((error, index) => {
            console.log(`  ${index + 1}. [${error.type}] ${error.message}`);
        });

        const criticalErrors = errors.filter((e) => e.type !== "deprecation");
        if (criticalErrors.length > 0) {
            console.log("\n❌ Critical errors found. Please fix your configuration.");
            process.exit(1);
        }
    }
}

/**
 * Fetch tasks from CalDAV server (implements getData from node_helper)
 */
async function fetchTasks() {
    console.log("\n📥 Fetching tasks from CalDAV server...\n");

    try {
        // Validate and normalize configuration
        const { valid, config: normalizedConfig, errors } = validateConfig(config);

        if (!valid) {
            const criticalErrors = errors.filter((e) => e.type !== "deprecation");
            if (criticalErrors.length > 0) {
                const errorMsg = criticalErrors.map((e) => e.message).join("; ");
                throw new Error(`Configuration error: ${errorMsg}`);
            }

            // Log deprecation warnings
            errors
                .filter((e) => e.type === "deprecation")
                .forEach((e) => console.warn(`[CLI] ${e.message}`));
        }

        // Use normalized config with defaults
        const effectiveConfig = { ...config, ...normalizedConfig };

        let allTasks = [];
        const calendarData = await fetchCalendarData(effectiveConfig);

        // Iterate over all calendars
        for (let i = 0; i < calendarData.length; i++) {
            const icsList = calendarData[i].icsStrings;
            const rawList = parseList(icsList, effectiveConfig.dateFormat);
            const priorityList = mapEmptyPriorityTo(
                rawList,
                effectiveConfig.mapEmptyPriorityTo
            );
            const sortIndexList = mapEmptySortIndexTo(
                priorityList,
                effectiveConfig.mapEmptySortIndexTo
            );
            const indexedList = appendUrlIndex(sortIndexList, i);
            const sortedList = sortList(indexedList, effectiveConfig.sortMethod);
            const sortedAppleList = sortList(sortedList, "apple");
            const nestedList = transformData(sortedAppleList);

            allTasks = allTasks.concat(nestedList);
            calendarData[i].tasks = nestedList;
        }

        // Display results
        const completedCount = allTasks.filter(
            (t) => t.status === "COMPLETED"
        ).length;
        const activeCount = allTasks.length - completedCount;

        console.log(
            `✅ Successfully fetched ${allTasks.length} tasks from ${calendarData.length} calendar(s)`
        );
        console.log(
            `   Active: ${activeCount} | Completed: ${completedCount}${!flags.showCompleted ? " (hidden)" : ""}\n`
        );

        calendarData.forEach((calendar, index) => {
            console.log(`📅 Calendar ${index + 1}: ${calendar.summary || "Unnamed"}`);
            console.log(`   URL: ${calendar.url}`);
            console.log(`   Color: ${calendar.calendarColor || "default"}`);
            console.log(`   Tasks: ${calendar.tasks?.length || 0}`);

            if (calendar.tasks && calendar.tasks.length > 0) {
                // Filter tasks based on flags
                let displayTasks = calendar.tasks;
                if (!flags.showCompleted) {
                    displayTasks = displayTasks.filter(
                        (task) => task.status !== "COMPLETED"
                    );
                }

                if (displayTasks.length === 0) {
                    console.log(
                        `   ℹ️  No active tasks (use --show-completed to see all)`
                    );
                } else {
                    console.log(`\n   📝 Tasks (${displayTasks.length}):\n`);
                    displayTasks.forEach((task, index) => {
                        const status = task.status === "COMPLETED" ? "✅" : "⬜";
                        const priority = task.priority || "-";
                        const summary = task.summary || "Unnamed task";

                        // Main task line
                        console.log(
                            `      ${index + 1}. ${status} ${summary} ${priority !== "-" ? `[P${priority}]` : ""}`
                        );

                        // Due date
                        if (task.due) {
                            const dueDate = task.dueFormatted || task.due;
                            const isOverdue =
                                new Date(task.due) < new Date() && task.status !== "COMPLETED";
                            console.log(
                                `          📅 Due: ${dueDate}${isOverdue ? " ⚠️ OVERDUE" : ""}`
                            );
                        }

                        // Start date
                        if (task.dtstart && flags.verbose) {
                            console.log(
                                `          🏁 Started: ${task.dtstartFormatted || task.dtstart}`
                            );
                        }

                        // Recurrence rule
                        if (task.rrule) {
                            let rruleText = "";
                            if (typeof task.rrule === "string") {
                                rruleText = task.rrule;
                            } else if (task.rrule.options) {
                                const opts = task.rrule.options;
                                // freq is a number constant from rrule library, map to string
                                const freqMap = {
                                    0: "yearly",
                                    1: "monthly",
                                    2: "weekly",
                                    3: "daily",
                                    4: "hourly",
                                    5: "minutely",
                                    6: "secondly"
                                };
                                const freq = freqMap[opts.freq] || "unknown";
                                const interval = opts.interval || 1;
                                const until = opts.until
                                    ? ` until ${new Date(opts.until).toLocaleDateString()}`
                                    : "";
                                const count = opts.count ? ` (${opts.count} times)` : "";
                                rruleText = `Every ${interval > 1 ? interval + " " : ""}${freq}${until}${count}`;
                            }
                            console.log(`          🔁 Repeats: ${rruleText}`);
                        }

                        // Description (first line only)
                        if (task.description && flags.verbose) {
                            const firstLine = task.description.split("\n")[0];
                            if (firstLine.length > 60) {
                                console.log(`          💬 ${firstLine.substring(0, 57)}...`);
                            } else {
                                console.log(`          💬 ${firstLine}`);
                            }
                        }

                        // UID (only with flag)
                        if (flags.showUid && task.uid) {
                            console.log(`          🔑 UID: ${task.uid}`);
                        }

                        // Filename (only with flag)
                        if (flags.showFile && task.filename) {
                            console.log(`          📄 File: ${task.filename}`);
                        }

                        console.log(""); // Empty line between tasks
                    });
                }
            }
        });

        return calendarData;
    } catch (error) {
        console.error("❌ Error fetching tasks:", error.message);
        if (process.env.DEBUG) {
            console.error("Stack trace:", error.stack);
        }
        throw error;
    }
}

/**
 * Toggle task completion status (implements toggleStatusViaWebDav from node_helper)
 */
async function toggleTask(uid) {
    if (!uid) {
        console.error("❌ Error: UID is required");
        console.log("Usage: node cli-debug.js toggle <uid>");
        process.exit(1);
    }

    console.log(`\n🔄 Toggling task: ${uid}...\n`);

    // First fetch to find the task
    const calendars = await fetchTasks();

    let foundTask = null;
    let filename = null;

    // Find the task
    for (const calendar of calendars) {
        if (calendar.tasks) {
            for (const task of calendar.tasks) {
                if (task.uid === uid || task.filename?.includes(uid)) {
                    foundTask = task;
                    filename = task.filename;
                    break;
                }
            }
        }
        if (foundTask) break;
    }

    if (!foundTask) {
        console.error(`❌ Task with UID ${uid} not found`);
        console.log(
            '\n💡 Tip: Run "node --run debug:fetch" to see all available UIDs'
        );
        process.exit(1);
    }

    console.log(`\n📝 Found task: ${foundTask.summary}`);
    console.log(`   Status: ${foundTask.status}`);
    console.log(`   Filename: ${filename}`);

    try {
        const client = initDAVClient(config);
        const completer = new VTodoCompleter(client);
        await completer.completeVTodo(config, filename);

        console.log("\n✅ Task toggled successfully!");
        console.log(
            "   New status:",
            foundTask.status === "COMPLETED" ? "IN-PROGRESS" : "COMPLETED"
        );

        console.log("\n🔄 Fetching updated tasks...\n");
        await fetchTasks();
    } catch (error) {
        console.error("\n❌ Error toggling task:", error.message);
        if (process.env.DEBUG) {
            console.error("Stack trace:", error.stack);
        }
        throw error;
    }
}

/**
 * Show help
 */
function showHelp() {
    console.log(`
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

Examples:
  node cli-debug.js test-config
  node cli-debug.js fetch
  node cli-debug.js fetch --show-completed --verbose
  node cli-debug.js fetch --show-uid --show-file
  node cli-debug.js toggle abc123-def456-ghi789
  node cli-debug.js fetch --config /path/to/custom-config.js

Configuration:
  The tool reads configuration from config/config.js
  Create this file from config/config.template.js

For more information, see: https://github.com/Coernel82/MMM-CalDAV-Tasks
`);
}

/**
 * Main execution
 */
async function main() {
    console.log("🚀 MMM-CalDAV-Tasks CLI Debug Tool\n");

    try {
        switch (command) {
            case "help":
            case "--help":
            case "-h":
                showHelp();
                break;

            case "test-config":
                loadConfig();
                await testConfig();
                break;

            case "fetch":
                loadConfig();
                await fetchTasks();
                break;

            case "toggle": {
                loadConfig();
                const uid = args[1];
                await toggleTask(uid);
                break;
            }

            default:
                console.error(`❌ Unknown command: ${command}`);
                console.log('Run "node cli-debug.js help" for usage information\n');
                process.exit(1);
        }

        console.log("\n✨ Done!\n");
        process.exit(0);
    } catch (error) {
        console.error("\n💥 Error:", error.message);
        if (process.env.DEBUG) {
            console.error("\nStack trace:");
            console.error(error.stack);
        }
        process.exit(1);
    }
}

// Run main
if (require.main === module) {
    main();
}

module.exports = { loadConfig, testConfig, fetchTasks, toggleTask };
