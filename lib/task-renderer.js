/* global window */

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * TaskRenderer - Helper for the task list rendering logic
 *
 * @class TaskRenderer
 */
class TaskRenderer {
  /**
   * Creates the checkbox icon element
   *
   * @param {string} status - Task status ("COMPLETED" or other)
   * @returns {HTMLElement} Icon element
   */
  static createIcon(status) {
    const icon = document.createElement("span");
    icon.className =
      status === "COMPLETED"
        ? "fa fa-fw fa-check-square"
        : "fa fa-fw fa-square";
    return icon;
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
   * Parses a normalized ISO date from the backend
   *
   * @param {string|null} iso - ISO date string
   * @returns {Date|null} Parsed date or null
   */
  static parseISO(iso) {
    if (!iso) {
      return null;
    }
    const date = new Date(iso);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  /**
   * The moment a task actually becomes overdue. An all-day task stays on time
   * until the end of its day, not from midnight onwards.
   *
   * @param {Object} element - Task element
   * @returns {Date|null} Deadline or null
   */
  static getDeadline(element) {
    const due = TaskRenderer.parseISO(element.dueISO);
    if (!due) {
      return null;
    }
    return element.dueDateOnly ? new Date(due.getTime() + DAY_MS) : due;
  }

  /**
   * Classifies a due date for badge styling
   *
   * @param {Object} element - Task element
   * @param {Date} now - Current time
   * @returns {string|null} "overdue" | "today" | "soon" | "future" | null
   */
  static getDueState(element, now) {
    const deadline = TaskRenderer.getDeadline(element);
    if (!deadline) {
      return null;
    }
    if (now >= deadline) {
      return "overdue";
    }

    const daysLeft = TaskRenderer.calendarDaysBetween(now, deadline);
    if (daysLeft <= (element.dueDateOnly ? 1 : 0)) {
      return "today";
    }
    return daysLeft <= 3 ? "soon" : "future";
  }

  /**
   * Whole calendar days between two dates, ignoring the time of day
   *
   * @param {Date} from - Start date
   * @param {Date} to - End date
   * @returns {number} Signed number of days
   */
  static calendarDaysBetween(from, to) {
    const startOfDay = (date) =>
      new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
    return Math.round((startOfDay(to) - startOfDay(from)) / DAY_MS);
  }

  /**
   * Human readable relative date ("today", "in 3 days", "2 days ago").
   * Uses Intl so it follows the MagicMirror language without translation files.
   *
   * @param {Date} date - Target date
   * @param {Date} now - Current time
   * @param {string} language - BCP 47 language tag
   * @returns {string} Relative label
   */
  static formatRelative(date, now, language) {
    return new Intl.RelativeTimeFormat(language || "en", {
      numeric: "auto",
    }).format(TaskRenderer.calendarDaysBetween(now, date), "day");
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
      const completed = TaskRenderer.parseISO(element.completedISO);
      // Without a COMPLETED timestamp the age is unknown - treat it as due for
      // hiding rather than keeping the task around forever.
      if (!completed) {
        return true;
      }
      const daysSinceCompleted = (now - completed) / DAY_MS;
      if (daysSinceCompleted > config.hideCompletedTasksAfter) {
        return true;
      }
    }

    // Check start date
    const start = TaskRenderer.parseISO(element.startISO);
    if (start) {
      const daysUntilStart = (start - now) / DAY_MS;
      if (daysUntilStart > config.startsInDays) {
        return true;
      }
    } else if (!config.showWithoutStart) {
      return true;
    }

    // Check due date
    const due = TaskRenderer.parseISO(element.dueISO);
    if (due) {
      const daysUntilDue = (due - now) / DAY_MS;
      if (daysUntilDue > config.dueInDays) {
        return true;
      }
    } else if (!config.showWithoutDue) {
      return true;
    }

    return false;
  }

  /**
   * Counts visible tasks in a nested task tree
   *
   * @param {Array} tasks - Task tree
   * @param {Object} config - Module configuration
   * @returns {{total: number, done: number}} Visible task counts
   */
  static countTasks(tasks, config) {
    let total = 0;
    let done = 0;

    for (const task of tasks) {
      if (TaskRenderer.shouldHideElement(task, config)) {
        continue;
      }
      total += 1;
      if (task.status === "COMPLETED") {
        done += 1;
      }
      if (task.children) {
        const nested = TaskRenderer.countTasks(task.children, config);
        total += nested.total;
        done += nested.done;
      }
    }

    return { total, done };
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
