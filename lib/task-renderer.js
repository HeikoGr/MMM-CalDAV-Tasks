/* global window, module */

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * TaskRenderer - Helper for the task list rendering logic
 *
 * @class TaskRenderer
 */
// A static-only class on purpose: it is the browser global the module and the
// tests share (window.TaskRenderer / module.exports), not an instantiable type.
// biome-ignore lint/complexity/noStaticOnlyClass: namespace for a browser global
class TaskRenderer {
  /**
   * Creates the checkbox icon element
   *
   * @param {string} status - Task status ("COMPLETED" or other)
   * @returns {HTMLElement} Icon element
   */
  static createIcon(status) {
    const icon = document.createElement("span");
    icon.className = status === "COMPLETED" ? "fa fa-fw fa-check-square" : "fa fa-fw fa-square";
    return icon;
  }

  /**
   * The iOS-style mark for a priority set on the task (RFC 5545: 1-4 high,
   * 5 medium, 6-9 low), or null when the task has none.
   *
   * @param {Object} element - Task
   * @returns {{text: string, level: string}|null} Mark text and level
   */
  static priorityMark(element) {
    const priority = Number(element.priority);
    if (element.priorityUnset || !(priority >= 1 && priority <= 9)) {
      return null;
    }
    if (priority <= 4) {
      return { text: "!!!", level: "high" };
    }
    return priority === 5 ? { text: "!!", level: "medium" } : { text: "!", level: "low" };
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
    const startOfDay = (date) => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
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
   * Counts the tasks in a nested task tree. The backend already dropped the
   * hidden ones (lib/task-filter.js).
   *
   * @param {Array} tasks - Task tree
   * @returns {{total: number, done: number}} Task counts
   */
  static countTasks(tasks) {
    let total = 0;
    let done = 0;

    for (const task of tasks || []) {
      total += 1;
      if (task.status === "COMPLETED") {
        done += 1;
      }
      if (task.children) {
        const nested = TaskRenderer.countTasks(task.children);
        total += nested.total;
        done += nested.done;
      }
    }

    return { total, done };
  }

  /**
   * Drops tasks whose grace period (hideAt, set by lib/task-filter.js) ran out
   * since the backend sent them, so they vanish without waiting for a fetch.
   *
   * @param {Array} tasks - Task tree
   * @param {number} nowMs - Reference time in ms
   * @returns {Array} Tasks still to show, children filtered the same way
   */
  static withoutExpired(tasks, nowMs) {
    const visible = [];
    for (const task of tasks || []) {
      if (task.hideAt && task.hideAt <= nowMs) {
        continue;
      }
      if (task.children) {
        const children = TaskRenderer.withoutExpired(task.children, nowMs);
        visible.push(children.length > 0 ? { ...task, children } : { ...task, children: undefined });
      } else {
        visible.push(task);
      }
    }
    return visible;
  }

  /**
   * Earliest hideAt in the data, i.e. when the display has to be redrawn.
   *
   * @param {Array|null} toDoList - Calendars with their tasks
   * @returns {number|null} Timestamp in ms, or null if nothing counts down
   */
  static nextHideAt(toDoList) {
    let next = null;
    const walk = (tasks) => {
      for (const task of tasks || []) {
        if (task.hideAt && (next === null || task.hideAt < next)) {
          next = task.hideAt;
        }
        walk(task.children);
      }
    };
    for (const calendar of toDoList || []) {
      walk(calendar.tasks);
    }
    return next;
  }

  /**
   * Builds the complete module DOM.
   *
   * @param {Object} state - What to render
   * @param {Array|null} state.toDoList - Calendars with their tasks (from the backend)
   * @param {Object|null} state.error - { title, lines, hint } or null
   * @param {Object} state.config - Module configuration
   * @param {string} [state.instanceId] - Stored as data-instance-id on the wrapper
   * @param {string} [state.language] - MagicMirror language for relative dates
   * @param {Date} [state.now] - Reference time
   * @param {Function} [state.bindItem] - (itemElement) => void, wires interaction
   * @returns {HTMLElement} Wrapper element
   */
  static renderModule(state) {
    const ctx = {
      config: state.config,
      language: state.language,
      now: state.now || new Date(),
      bindItem: state.bindItem || (() => {}),
      usedUrlIndices: [],
    };

    const wrapper = document.createElement("div");
    wrapper.className = "MMM-CalDAV-Tasks-wrapper";
    if (state.instanceId) {
      wrapper.dataset.instanceId = state.instanceId;
    }

    // Show error message if present (even with old data)
    if (state.error) {
      wrapper.appendChild(TaskRenderer.createErrorElement(state.error));
    }

    if (state.toDoList) {
      for (const calendar of state.toDoList) {
        wrapper.appendChild(TaskRenderer.renderCalendar(calendar, ctx));
      }
    } else if (!state.error) {
      const loading = document.createElement("div");
      loading.className = "MMM-CalDAV-Tasks-Loading";
      loading.textContent = "Loading...";
      wrapper.appendChild(loading);
    }

    return wrapper;
  }

  static createErrorElement(error) {
    const errorDiv = document.createElement("div");
    errorDiv.className = "MMM-CalDAV-Tasks-error";

    const title = document.createElement("div");
    title.className = "MMM-CalDAV-Tasks-error-title";
    title.textContent = error.title;
    errorDiv.appendChild(title);

    for (const line of error.lines || []) {
      const lineDiv = document.createElement("div");
      lineDiv.textContent = line;
      errorDiv.appendChild(lineDiv);
    }

    if (error.hint) {
      const hint = document.createElement("div");
      hint.className = "MMM-CalDAV-Tasks-error-hint";
      hint.textContent = error.hint;
      errorDiv.appendChild(hint);
    }

    return errorDiv;
  }

  static renderCalendar(calendar, ctx) {
    const calWrapper = document.createElement("div");
    calWrapper.className = "MMM-CalDAV-Tasks-Calendar-wrapper";
    if (calendar.calendarColor) {
      calWrapper.style.setProperty("--calendar-color", calendar.calendarColor);
    }

    const header = document.createElement("div");
    header.className = "MMM-CalDAV-Tasks-Calendar-Header";

    const h2 = document.createElement("h2");
    h2.textContent = calendar.summary;
    h2.className = "MMM-CalDAV-Tasks-Calendar-Heading";
    header.appendChild(h2);

    const tasks = TaskRenderer.withoutExpired(calendar.tasks, ctx.now.getTime());
    const { total, done } = TaskRenderer.countTasks(tasks);
    if (total > 0) {
      const count = document.createElement("span");
      count.className = "MMM-CalDAV-Tasks-Count";
      count.textContent = `${total - done}`;
      header.appendChild(count);
    }

    calWrapper.appendChild(header);

    if (total === 0) {
      const empty = document.createElement("div");
      empty.className = "MMM-CalDAV-Tasks-Empty";
      empty.textContent = "All done";
      calWrapper.appendChild(empty);
    } else {
      calWrapper.appendChild(TaskRenderer.renderList(tasks, ctx));
    }

    return calWrapper;
  }

  // The backend already dropped hidden tasks (lib/task-filter.js).
  static renderList(children, ctx, isTopLevel = true) {
    const ul = document.createElement("ul");

    for (const element of children) {
      const li = document.createElement("li");
      if (isTopLevel) {
        li.classList.add("MMM-CalDAV-Tasks-Toplevel");
      }

      TaskRenderer.addHeadingIfNeeded(ul, element, ctx);
      li.appendChild(TaskRenderer.createListItem(element, ctx));

      if (element.children) {
        const childList = TaskRenderer.renderList(element.children, ctx, false);
        childList.classList.add("MMM-CalDAV-Tasks-SubList");
        li.appendChild(childList);
      }

      ul.appendChild(li);
    }

    return ul;
  }

  static addHeadingIfNeeded(ul, element, ctx) {
    if (ctx.usedUrlIndices.includes(element.urlIndex)) {
      return;
    }
    ctx.usedUrlIndices.push(element.urlIndex);
    const headingText = (ctx.config.headings || [])[element.urlIndex];
    if (headingText !== null && headingText !== "null" && headingText !== undefined) {
      const headingItem = document.createElement("li");
      headingItem.className = "MMM-CalDAV-Tasks-Heading-Item";
      const h2 = document.createElement("h2");
      h2.className = `MMM-CalDAV-Tasks-Heading-${element.urlIndex}`;
      h2.textContent = headingText;
      headingItem.appendChild(h2);
      ul.appendChild(headingItem);
    }
  }

  static createListItem(element, ctx) {
    const { priority, status, urlIndex, uid, filename, summary, rrule } = element;
    const { config } = ctx;
    const isCompleted = status === "COMPLETED";

    const item = document.createElement("div");
    item.className = "MMM-CalDAV-Tasks-List-Item";
    if (isCompleted) {
      item.classList.add("MMM-CalDAV-Tasks-Completed");
    }
    item.dataset.urlIndex = urlIndex;
    item.dataset.uid = uid;
    item.dataset.vtodoFilename = filename;

    const iconBox = document.createElement("div");
    iconBox.className = TaskRenderer.getPriorityIconClass(priority, config.colorize);
    iconBox.appendChild(TaskRenderer.createIcon(status));
    item.appendChild(iconBox);

    const body = document.createElement("div");
    body.className = "MMM-CalDAV-Tasks-Body";

    const summaryDiv = document.createElement("div");
    summaryDiv.className = "MMM-CalDAV-Tasks-Summary";
    const mark = TaskRenderer.priorityMark(element);
    if (mark) {
      const markSpan = document.createElement("span");
      markSpan.className = `MMM-CalDAV-Tasks-Priority-Mark MMM-CalDAV-Tasks-Priority-Mark-${mark.level}`;
      markSpan.textContent = mark.text;
      summaryDiv.appendChild(markSpan);
    }
    const summaryText = document.createElement("span");
    summaryText.textContent = summary;
    summaryDiv.appendChild(summaryText);
    if (rrule) {
      const repeat = document.createElement("span");
      repeat.className = "MMM-CalDAV-Tasks-RRule-Icon fa-solid fa-repeat";
      summaryDiv.appendChild(repeat);
    }
    body.appendChild(summaryDiv);
    body.appendChild(TaskRenderer.createDateSection(element, ctx));
    item.appendChild(body);

    if (config.showCompletionPercent) {
      const percentage = document.createElement("div");
      percentage.className = "MMM-CalDAV-Tasks-Percentage";
      const canvas = document.createElement("canvas");
      canvas.className = "MMM-CalDAV-Tasks-CompletionCanvas";
      TaskRenderer.drawCompletionChart(canvas, element.completion, config);
      percentage.appendChild(canvas);
      item.appendChild(percentage);
    }

    // Empties until the just-completed task is hidden (grace period).
    const remaining = element.hideAt ? element.hideAt - ctx.now.getTime() : 0;
    if (remaining > 0) {
      const grace = (config.completedTaskGracePeriod || 0) * 1000;
      const countdown = document.createElement("div");
      countdown.className = "MMM-CalDAV-Tasks-Hide-Countdown";
      countdown.style.setProperty("--countdown-start", `${grace > 0 ? Math.min(1, remaining / grace) : 1}`);
      countdown.style.animationDuration = `${remaining}ms`;
      item.appendChild(countdown);
    }

    // Fills over toggleTime so the long press shows how long to keep holding.
    const pressProgress = document.createElement("div");
    pressProgress.className = "MMM-CalDAV-Tasks-Press-Progress";
    item.appendChild(pressProgress);

    ctx.bindItem(item);

    return item;
  }

  static createDateSection(element, ctx) {
    const { status, dueFormatted, startFormatted } = element;
    const { config, now, language } = ctx;
    const isCompleted = status === "COMPLETED";

    const section = document.createElement("div");
    section.className = "MMM-CalDAV-Tasks-Date-Section";
    if (isCompleted) {
      section.classList.add("MMM-CalDAV-Tasks-Completed");
      if (config.hideDateSectionOnCompletion) {
        section.style.display = "none";
      }
    }

    const start = TaskRenderer.parseISO(element.startISO);
    if (config.displayStartDate && start) {
      const badge = document.createElement("span");
      badge.className = "MMM-CalDAV-Tasks-Badge MMM-CalDAV-Tasks-StartDate";
      if (now > start && config.highlightStartedTasks) {
        badge.classList.add("MMM-CalDAV-Tasks-Started");
      }
      badge.textContent = TaskRenderer.formatDateLabel(start, now, startFormatted, language, element.startDateOnly);
      section.appendChild(badge);
    }

    const due = TaskRenderer.parseISO(element.dueISO);
    if (config.displayDueDate && due) {
      const state = TaskRenderer.getDueState(element, now);
      const badge = document.createElement("span");
      badge.className = "MMM-CalDAV-Tasks-Badge MMM-CalDAV-Tasks-DueDate";
      if (state === "overdue" && config.highlightOverdueTasks) {
        badge.classList.add("MMM-CalDAV-Tasks-Overdue");
      } else if (state === "today" || state === "soon") {
        badge.classList.add(`MMM-CalDAV-Tasks-Due-${state}`);
      }
      badge.textContent = TaskRenderer.formatDateLabel(due, now, dueFormatted, language, element.dueDateOnly);
      section.appendChild(badge);
    }

    return section;
  }

  /*
   * Near dates read better relative ("tomorrow", "2 days ago"); anything
   * further out keeps the configured absolute format. For a task due today
   * the time of day is the useful part, so "today" gives way to it.
   */
  static formatDateLabel(date, now, absolute, language, dateOnly) {
    const days = TaskRenderer.calendarDaysBetween(now, date);
    if (days === 0 && !dateOnly && absolute) {
      return absolute;
    }
    if (Math.abs(days) <= 7) {
      return TaskRenderer.formatRelative(date, now, language);
    }
    return absolute || TaskRenderer.formatRelative(date, now, language);
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

// Browser: global for the module. Node: export for the tests.
if (typeof window !== "undefined") {
  window.TaskRenderer = TaskRenderer;
}
if (typeof module !== "undefined" && module.exports) {
  module.exports = TaskRenderer;
}
