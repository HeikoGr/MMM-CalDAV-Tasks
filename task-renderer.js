/* global window */

/**
 * TaskRenderer - Simplified helper for DOM rendering logic
 *
 * Provides reusable functions for creating task list elements
 * to reduce code duplication in MMM-CalDAV-Tasks.js
 *
 * @class TaskRenderer
 */
class TaskRenderer {
    /**
     * Creates icon HTML for checkbox
     *
     * @param {string} status - Task status ("COMPLETED" or other)
     * @returns {string} HTML for icon
     */
    static getIconHTML(status) {
        return status === "COMPLETED"
            ? '<span class="fa fa-fw fa-check-square"></span>'
            : '<span class="fa fa-fw fa-square"></span>';
    }

    /**
     * Creates CSS class for priority icon
     *
     * @param {number} priority - Task priority
     * @param {boolean} colorize - Whether to colorize
     * @returns {string} CSS class names
     */
    static getPriorityIconClass(priority, colorize) {
        return colorize
            ? `MMM-CalDAV-Tasks-Priority-Icon MMM-CalDAV-Tasks-Priority-${priority}`
            : "MMM-CalDAV-Tasks-Priority-Icon";
    }

    /**
     * Creates CSS class for date based on context
     *
     * @param {Date} date - The date to check
     * @param {Date} now - Current date
     * @param {string} type - "start" or "due"
     * @returns {string} CSS class name
     */
    static getDateClass(date, now, type) {
        if (type === "start") {
            return now > date
                ? "MMM-CalDAV-Tasks-Started"
                : "MMM-CalDAV-Tasks-StartDate";
        }
        return now > date ? "MMM-CalDAV-Tasks-Overdue" : "MMM-CalDAV-Tasks-DueDate";
    }

    /**
     * Checks if element should be hidden based on dates and config
     *
     * @param {Object} element - Task element
     * @param {Object} config - Module configuration
     * @returns {boolean} True if should be hidden
     */
    static shouldHideElement(element, config) {
        const now = new Date();

        // Hide completed tasks after certain days
        if (
            element.status === "COMPLETED" &&
            config.hideCompletedTasksAfter !== null
        ) {
            const completedDate = new Date(element.completed);
            const daysSinceCompleted = (now - completedDate) / (1000 * 60 * 60 * 24);
            if (daysSinceCompleted > config.hideCompletedTasksAfter) {
                return true;
            }
        }

        // Check start date
        if (element.start) {
            const start = new Date(element.start);
            const daysUntilStart = (start - now) / (1000 * 60 * 60 * 24);
            if (daysUntilStart > config.startsInDays) {
                return true;
            }
        } else if (!config.showWithoutStart) {
            return true;
        }

        // Check due date
        if (element.end) {
            const end = new Date(element.end);
            const daysUntilDue = (end - now) / (1000 * 60 * 60 * 24);
            if (daysUntilDue > config.dueInDays) {
                return true;
            }
        } else if (!config.showWithoutDue) {
            return true;
        }

        return false;
    }

    /**
     * Draws a completion percentage pie chart on a canvas element
     *
     * @param {HTMLCanvasElement} canvas - The canvas element
     * @param {number} completion - Completion percentage (0-100)
     * @param {Object} config - Module configuration with chart colors and size
     */
    static drawCompletionChart(canvas, completion, config) {
        const ctx = canvas.getContext("2d");
        const size = config.pieChartSize;
        canvas.width = size;
        canvas.height = size;
        const completionValue = Number(completion) || 0;
        const centerX = size / 2;
        const centerY = size / 2;
        const outerRadius = size / 2;
        const innerRadius = outerRadius - (outerRadius * 0.9) / 2;
        const startAngle = -Math.PI / 2;
        const endAngle = startAngle + (completionValue / 100) * 2 * Math.PI;

        // Draw background arc
        ctx.fillStyle = config.pieChartBackgroundColor;
        ctx.beginPath();
        ctx.arc(centerX, centerY, outerRadius, 0, 2 * Math.PI, false);
        ctx.arc(centerX, centerY, innerRadius, 2 * Math.PI, 0, true);
        ctx.closePath();
        ctx.fill();

        // Draw completion arc
        if (completionValue > 0) {
            ctx.fillStyle = config.pieChartColor;
            ctx.beginPath();
            ctx.arc(centerX, centerY, outerRadius, startAngle, endAngle, false);
            ctx.arc(centerX, centerY, innerRadius, endAngle, startAngle, true);
            ctx.closePath();
            ctx.fill();
        }
    }
}

// Make TaskRenderer available globally for MagicMirror module
if (typeof window !== "undefined") {
    window.TaskRenderer = TaskRenderer;
}
