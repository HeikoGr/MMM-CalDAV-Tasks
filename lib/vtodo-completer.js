const { RRule } = require("rrule");
const webDavHelper = require("./webDavHelper");
const { parseIcsDate, formatIcsDate } = require("./date-utils");
const { log } = require("./logger");

/**
 * Class representing a VTodoCompleter.
 */
class VTodoCompleter {
  /**
   * Create a VTodoCompleter.
   * @param {Object} webdavClient - The tsdav webdav client.
   * @param {Object} [options] - Optional overrides.
   * @param {Object} [options.logger] - Logger with debug/info/warn/error.
   * @param {Function} [options.getFileContents] - Reader, injectable for tests.
   * @param {Function} [options.putFileContents] - Writer, injectable for tests.
   */
  constructor(webdavClient, options = {}) {
    if (!webdavClient) {
      throw new Error("WebDAV client is required");
    }
    this.client = webdavClient;
    this.logger = options.logger || log;
    this.getFileContents = options.getFileContents || webDavHelper.getFileContents;
    this.putFileContents = options.putFileContents || webDavHelper.putFileContents;
    this.componentStack = [];
    this.currentDepth = 0;
  }

  /**
   * Complete a VTODO item.
   * @param {Object} config - The module configuration.
   * @param {string} filename - The filename (object URL) of the VTODO item.
   * @param {Date} [completedDate=new Date()] - The completion date.
   * @returns {Object} - The original filename and, for a recurring task, the
   *   filename of the newly written completed occurrence.
   */
  async completeVTodo(config, filename, completedDate = new Date()) {
    this.logger.info("Completing VTODO", { filename });

    const icsContent = await this.getFileContents(config, filename);
    const parsed = this.parseICS(icsContent.data);

    if (this.isRecurring(parsed)) {
      this.logger.debug("VTODO is recurring");
      const newFilename = await this.handleRecurrence(
        config,
        parsed,
        filename,
        completedDate,
      );
      return { original: filename, new: newFilename };
    }
    this.logger.debug("VTODO is not recurring");
    await this.updateNonRecurring(config, parsed, filename, completedDate);
    return { original: filename };
  }

  /**
   * Reopen a completed VTODO item.
   *
   * The counterpart to completeVTodo: the long press in the frontend toggles
   * in both directions, so "unchecked" has to be able to undo a completion.
   * For an occurrence that completeVTodo split off from a recurring series
   * this reopens that single occurrence - the series itself has already moved
   * on and is a separate object.
   * @param {Object} config - The module configuration.
   * @param {string} filename - The filename (object URL) of the VTODO item.
   * @returns {Object} - An object containing the original filename.
   */
  async uncompleteVTodo(config, filename) {
    this.logger.info("Reopening VTODO", { filename });

    const icsContent = await this.getFileContents(config, filename);
    const parsed = this.parseICS(icsContent.data);

    this.setProperty(parsed, "VTODO", "STATUS", "NEEDS-ACTION");
    this.delProperty(parsed, "VTODO", "COMPLETED");
    this.delProperty(parsed, "VTODO", "PERCENT-COMPLETE");
    this.stampModified(parsed);

    await this.putFileContents(config, filename, this.generateICS(parsed));
    return { original: filename };
  }

  /**
   * Check if the VTODO item is recurring.
   * @param {Array} parsed - The parsed ICS data.
   * @returns {boolean} - True if the VTODO item is recurring, false otherwise.
   */
  isRecurring(parsed) {
    return parsed.some((i) => i.key === "RRULE" && i.component === "VTODO");
  }

  /**
   * Update a non-recurring VTODO item.
   * @param {Object} config - The module configuration.
   * @param {Array} parsed - The parsed ICS data.
   * @param {string} filename - The filename of the VTODO item.
   * @param {Date} completedDate - The completion date.
   * @returns {string} - The filename that was written.
   */
  async updateNonRecurring(config, parsed, filename, completedDate) {
    this.logger.debug("Updating non-recurring VTODO item");

    this.markCompleted(parsed, completedDate);

    await this.putFileContents(config, filename, this.generateICS(parsed));
    return filename;
  }

  /**
   * Handle recurrence for a VTODO item.
   *
   * Completing one occurrence of a series means two writes: a standalone
   * record of the occurrence that was just finished, and the series itself
   * moved on to its next due date.
   * @param {Object} config - The module configuration.
   * @param {Array} parsed - The parsed ICS data.
   * @param {string} filename - The filename of the VTODO item.
   * @param {Date} completedDate - The completion date.
   * @returns {string|null} - The filename of the completed occurrence, or null
   *   if the series ended with this occurrence.
   */
  async handleRecurrence(config, parsed, filename, completedDate) {
    this.logger.debug("Handling recurrence for VTODO item");

    const nextDate = this.findNextOccurrence(parsed);

    if (!nextDate) {
      /*
       * COUNT or UNTIL is exhausted: this was the last occurrence. Completing
       * it in place ends the series. The old code fell into Math.max(null,
       * null) here and moved the task to 1970 instead.
       */
      this.logger.info("RRULE has no further occurrence, completing in place");
      await this.updateNonRecurring(config, parsed, filename, completedDate);
      return null;
    }

    const originalUID = this.getElementValue(parsed, "VTODO", "UID", true);
    const newUID = this.generateUID();
    const newFilename = this.buildOccurrenceFilename(
      filename,
      originalUID,
      newUID,
    );

    /*
     * The completed copy has to carry the dates of the occurrence that was
     * just finished, so it is taken before the series is moved forward.
     */
    const completedOccurrence = this.buildCompletedOccurrence(
      parsed,
      completedDate,
      newUID,
    );

    this.logger.debug("Writing completed occurrence", {
      filename: newFilename,
      nextDue: nextDate.toISOString(),
    });

    /*
     * Write the record of the completed occurrence first. If moving the series
     * forward fails afterwards, the completion is not lost and the next long
     * press simply retries; the other order would leave the occurrence
     * silently rescheduled with no trace that it was ever done.
     */
    await this.putFileContents(
      config,
      newFilename,
      this.generateICS(completedOccurrence),
      { create: true },
    );

    this.updateVTodoItem(parsed, nextDate);
    await this.putFileContents(config, filename, this.generateICS(parsed));

    return newFilename;
  }

  /**
   * Find the next due date of a recurring VTODO item.
   *
   * The next occurrence has to lie after the occurrence that was just
   * completed and after today - a series that fell behind must not hand out a
   * date in the past.
   * @param {Array} parsed - The parsed ICS data.
   * @returns {Date|null} - The next occurrence, or null if the rule is exhausted.
   */
  findNextOccurrence(parsed) {
    const originalRRULE = this.getElementLine(parsed, "VTODO", "RRULE");
    const originalDTSTART = this.getElementValue(
      parsed,
      "VTODO",
      "DTSTART",
      true,
    );
    const originalDue = this.getElementValue(parsed, "VTODO", "DUE", true);
    const anchorValue = originalDue || originalDTSTART;

    if (!originalRRULE || !anchorValue) {
      return null;
    }

    const rule = this.buildRule(parsed);

    if (!rule) {
      return null;
    }

    const currentDue = parseIcsDate(anchorValue, "rruleDatetime");
    const todayStart = new Date(new Date().setHours(0, 0, 0, 0));
    const after =
      currentDue.getTime() > todayStart.getTime() ? currentDue : todayStart;

    // rule.after() returns null once COUNT/UNTIL is reached.
    const next = rule.after(after, false);

    this.logger.debug("Next occurrence resolved", {
      rrule: originalRRULE,
      currentDue: currentDue.toISOString(),
      next: next ? next.toISOString() : null,
    });

    return next;
  }

  /**
   * Build the standalone record of a finished occurrence.
   * @param {Array} parsed - The parsed ICS data of the series.
   * @param {Date} completedDate - The completion date.
   * @param {string} uid - The UID for the new object.
   * @returns {Array} - Parsed ICS data for the completed occurrence.
   */
  buildCompletedOccurrence(parsed, completedDate, uid) {
    const occurrence = JSON.parse(JSON.stringify(parsed));

    /*
     * A record of one finished occurrence must not recur again, and its alarm
     * has already served its purpose - the series keeps both.
     */
    this.delProperty(occurrence, "VTODO", "RRULE");
    this.removeComponent(occurrence, "VALARM");

    this.setProperty(occurrence, "VTODO", "UID", uid);
    this.markCompleted(occurrence, completedDate);

    return occurrence;
  }

  /**
   * Mark a parsed VTODO as completed.
   * @param {Array} parsed - The parsed ICS data.
   * @param {Date} completedDate - The completion date.
   */
  markCompleted(parsed, completedDate) {
    this.setProperty(
      parsed,
      "VTODO",
      "COMPLETED",
      formatIcsDate(completedDate),
      "CREATED",
    );
    this.setProperty(parsed, "VTODO", "STATUS", "COMPLETED");
    this.setProperty(parsed, "VTODO", "PERCENT-COMPLETE", "100", "STATUS");
    this.stampModified(parsed);
  }

  /**
   * Refresh DTSTAMP and LAST-MODIFIED.
   * @param {Array} parsed - The parsed ICS data.
   */
  stampModified(parsed) {
    const now = formatIcsDate(new Date());
    this.setProperty(parsed, "VTODO", "DTSTAMP", now);
    this.setProperty(parsed, "VTODO", "LAST-MODIFIED", now);
  }

  /**
   * Derive the object URL for a newly created occurrence.
   * @param {string} filename - The object URL of the series.
   * @param {string|null} originalUID - The UID of the series.
   * @param {string} newUID - The UID of the new object.
   * @returns {string} - The object URL to write the occurrence to.
   */
  buildOccurrenceFilename(filename, originalUID, newUID) {
    if (originalUID && filename.includes(originalUID)) {
      return filename.replace(originalUID, newUID);
    }

    /*
     * Not every server names an object after its UID. Replacing a UID that is
     * not in the URL is a no-op, which would have made the new occurrence
     * overwrite the series; build a sibling URL in the same collection instead.
     */
    const collection = filename.slice(0, filename.lastIndexOf("/") + 1);
    return `${collection}${newUID}.ics`;
  }

  /**
   * Update a VTODO item with a new due date.
   * @param {Array} parsed - The parsed ICS data.
   * @param {Date} maxDate - The new due date.
   */
  /**
   * Build the RRule for a series from its current DTSTART and rule line.
   * @param {Array} parsed - The parsed ICS data.
   * @returns {RRule|null} - The rule, or null if the task does not recur.
   */
  buildRule(parsed) {
    const rruleLine = this.getElementLine(parsed, "VTODO", "RRULE");
    const dtstart = this.getElementValue(parsed, "VTODO", "DTSTART", true);
    const due = this.getElementValue(parsed, "VTODO", "DUE", true);

    if (!rruleLine || !(dtstart || due)) {
      return null;
    }

    const startDate = parseIcsDate(dtstart || due, "jsDate");
    return RRule.fromString(`DTSTART:${formatIcsDate(startDate)}\r\n${rruleLine}`);
  }

  /**
   * Write back how many occurrences a COUNT rule has left.
   *
   * COUNT is counted from DTSTART, and DTSTART moves every time the series is
   * advanced. Leaving the number alone therefore hands the rule its full quota
   * back on each completion, so "COUNT=3" would recur forever and
   * handleRecurrence would never reach the in-place close. UNTIL is an
   * absolute date and needs no such bookkeeping.
   * @param {Array} parsed - The parsed ICS data.
   * @param {Date} nextDate - The occurrence the series is being moved to.
   */
  consumeRuleCount(parsed, nextDate) {
    const rule = this.buildRule(parsed);

    if (!rule?.options?.count) {
      return;
    }

    // COUNT is finite, so enumerating the rule is bounded by it.
    const remaining = rule
      .all()
      .filter((date) => date.getTime() >= nextDate.getTime()).length;
    const value = this.getElementValue(parsed, "VTODO", "RRULE", true);

    if (!value || !remaining) {
      return;
    }

    this.logger.debug("Consuming one occurrence of a COUNT rule", {
      remaining,
    });

    this.setProperty(
      parsed,
      "VTODO",
      "RRULE",
      value.replace(/COUNT=\d+/i, `COUNT=${remaining}`),
    );
  }

  updateVTodoItem(parsed, maxDate) {
    this.logger.debug("Moving series to next occurrence", {
      due: maxDate.toISOString(),
    });

    // Must run before DTSTART moves - the rule is anchored to the old one.
    this.consumeRuleCount(parsed, maxDate);

    const previousStart = this.getElementValue(parsed, "VTODO", "DTSTART", true);
    const previousDue = this.getElementValue(parsed, "VTODO", "DUE", true);

    /*
     * Occurrences are generated from DTSTART, so that is what maxDate is. A
     * task that ran from 08:00 to 10:00 has to keep that window instead of
     * collapsing to a single instant, so DUE moves by the same distance.
     */
    let newDue = maxDate;
    if (previousStart && previousDue) {
      const span =
        parseIcsDate(previousDue, "jsDate").getTime() -
        parseIcsDate(previousStart, "jsDate").getTime();
      newDue = new Date(maxDate.getTime() + span);
    }

    // Only move what the task actually has; adding a DTSTART to a task that
    // never had one would change how it is displayed.
    if (previousStart) {
      this.setProperty(parsed, "VTODO", "DTSTART", formatIcsDate(maxDate));
    }
    if (previousDue || !previousStart) {
      this.setProperty(parsed, "VTODO", "DUE", formatIcsDate(newDue));
    }

    // The series is open again, even if the instance just handled was completed
    // elsewhere before.
    this.setProperty(parsed, "VTODO", "STATUS", "NEEDS-ACTION");
    this.delProperty(parsed, "VTODO", "COMPLETED");
    this.delProperty(parsed, "VTODO", "PERCENT-COMPLETE");
    this.stampModified(parsed);

    this.moveAlarm(parsed, newDue, previousDue || previousStart);
  }

  /**
   * Move an absolute VALARM trigger along with the new due date.
   * @param {Array} parsed - The parsed ICS data.
   * @param {Date} maxDate - The new due date.
   * @param {string|null} previousDue - The ICS date the alarm was relative to.
   */
  moveAlarm(parsed, maxDate, previousDue) {
    const trigger = this.getElementValue(parsed, "VALARM", "TRIGGER", true);

    if (!trigger) {
      return;
    }

    /*
     * A relative trigger ("-PT15M") is anchored to DTSTART/DUE and moves on its
     * own. Only an absolute one has to be rewritten - and it must not be parsed
     * as a date, which used to throw and abort the whole completion.
     */
    if (!/^\d{8}(T\d{6}Z?)?$/.test(trigger)) {
      this.logger.debug("Leaving relative VALARM trigger untouched", {
        trigger,
      });
      return;
    }

    // Keep the alarm's distance to the due date instead of firing it exactly
    // at the new one.
    let newAlarmDate = maxDate;
    if (previousDue) {
      const offset =
        parseIcsDate(trigger, "jsDate").getTime() -
        parseIcsDate(previousDue, "jsDate").getTime();
      newAlarmDate = new Date(maxDate.getTime() + offset);
    }

    this.logger.debug("Moving VALARM trigger", {
      from: trigger,
      to: formatIcsDate(newAlarmDate),
    });

    const uid = this.generateUID();
    this.setProperty(parsed, "VALARM", "TRIGGER", formatIcsDate(newAlarmDate));
    this.setProperty(parsed, "VALARM", "UID", uid);
    this.setProperty(parsed, "VALARM", "X-WR-ALARMUID", uid);
    // An acknowledged alarm stays silent; the next occurrence has to ring again.
    this.delProperty(parsed, "VALARM", "ACKNOWLEDGED");
  }

  /**
   * Parse ICS content.
   * @param {string} icsContent - The ICS content.
   * @returns {Array} - An array containing the parsed lines.
   */
  parseICS(icsContent) {
    this.componentStack = [];
    this.currentDepth = 0;

    // Strip the CR of CRLF here; generateICS joins with CRLF again, so keeping
    // it would double up and leak into every parsed value.
    const lines = icsContent.split("\n").map((line) => line.replace(/\r$/, ""));
    return lines.map((line) => {
      const [keyPart, ...valueParts] = line.split(":");
      const value = valueParts.join(":");
      const [key, ...params] = keyPart.split(";");
      this.getCurrentContext(line);
      return {
        original: line,
        key,
        params: params.join(";"),
        value,
        depth: this.currentDepth,
        component: this.componentStack[this.componentStack.length - 1],
        parent: this.componentStack[this.componentStack.length - 2],
        modified: false,
      };
    });
  }

  /**
   * Get the current context from a line in ICS file.
   * @param {string} line - The ICS line to process
   * @returns {{currentComponent: string, hierarchy: string[]}} Object containing current component and hierarchy stack
   */
  getCurrentContext(line) {
    if (line.startsWith("BEGIN:")) {
      this.componentStack.push(line.split(":")[1]);
      this.currentDepth++;
    } else if (line.startsWith("END:")) {
      this.componentStack.pop();
      this.currentDepth = Math.max(0, this.currentDepth - 1);
    }

    return {
      currentComponent: this.componentStack[this.componentStack.length - 1],
      hierarchy: [...this.componentStack],
    };
  }

  /**
   * Generate a unique identifier (UID) for ICS entries.
   * @returns {string} RFC4122 version 4 compliant UUID in uppercase
   */
  generateUID() {
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === "x" ? r : (r & 0x3) | 0x8;
      return v.toString(16).toUpperCase();
    });
  }

  /**
   * Get an element from the parsed ICS data.
   * @param {Array} parsed - The parsed ICS data.
   * @param {string} component - The component name (e.g., 'VTODO').
   * @param {string} key - The property name.
   * @returns {Object|null} - The found element or null if not found.
   */
  getElementLine(parsed, component, key) {
    return (
      parsed.find(
        (i) => i.key === key && i.component === component && !i.delete,
      )?.original || null
    );
  }

  /**
   * Get an element from the parsed ICS data.
   * @param {Array} parsed - The parsed ICS data.
   * @param {string} component - The component name (e.g., 'VTODO').
   * @param {string} key - The property name.
   * @param {boolean} [original] - get original String instead of altered value (optional).
   * @returns {Object|null} - The found element or null if not found.
   */
  getElementValue(parsed, component, key, original = false) {
    const element = parsed.find(
      (i) => i.key === key && i.component === component && !i.delete,
    );
    if (!element) {
      return null;
    }
    if (original && !element.add) {
      return element.original.split(":")[1] || null;
    }
    return element.value || null;
  }

  /**
   * Set a property in the parsed ICS data.
   * @param {Array} parsed - The parsed ICS data.
   * @param {string} component - The component name (e.g., 'VTODO').
   * @param {string} key - The property name.
   * @param {string} value - The property value.
   * @param {string} [addBefore='END'] - The key before which the new property should be added if it doesn't exist.
   */
  setProperty(parsed, component, key, value, addBefore = "END") {
    const existing = parsed.find(
      (i) => i.key === key && i.component === component,
    );

    if (existing) {
      existing.value = value;
      existing.modified = true;
      // A property that was deleted earlier in the same run is being set again.
      existing.delete = false;
      this.logger.debug(`set property: ${key}`, { component, value });
    } else {
      this.addProperty(parsed, component, key, value, "", addBefore);
    }
  }

  /**
   * Add a new property to the parsed ICS data.
   * @param {Array} parsed - The parsed ICS data.
   * @param {string} component - The component name (e.g., 'VTODO').
   * @param {string} key - The property name (e.g., 'COMPLETED').
   * @param {string} value - The property value.
   * @param {string} [params=''] - The parameters (e.g., 'VALUE=DATE').
   * @param {string} [addBefore='END'] - The key before which the new property should be added.
   */
  addProperty(parsed, component, key, value, params = "", addBefore = "END") {
    const newItem = {
      original: "",
      key,
      params,
      value,
      component,
      parent: component === "VCALENDAR" ? undefined : "VCALENDAR",
      modified: true,
      add: true,
    };

    /*
     * An END line belongs to the enclosing component, so it is matched by its
     * value. Anchoring on the component's own END keeps a VALARM property
     * inside the VALARM - the old code always landed before END:VTODO and
     * could add a second UID to the task itself.
     */
    const endIndex =
      addBefore === "END"
        ? parsed.findIndex((i) => i.key === "END" && i.value === component)
        : parsed.findIndex(
            (i) => i.key === addBefore && i.component === component,
          );

    this.logger.debug(`add property: ${key}`, {
      component,
      value,
      position: endIndex,
    });

    if (endIndex !== -1) {
      // Insert the new item before the closing element
      parsed.splice(endIndex, 0, newItem);
    } else {
      // If the anchor is not found, push the new item to the end
      parsed.push(newItem);
    }
  }

  /**
   * Delete a property from the parsed ICS data.
   * @param {Array} parsed - The parsed ICS data.
   * @param {string} component - The component name (e.g., 'VTODO').
   * @param {string} key - The property name to delete.
   * @returns {boolean} - True if the property was deleted, false otherwise.
   */
  delProperty(parsed, component, key) {
    const existingEntries = parsed.filter(
      (i) => i.key === key && i.component === component,
    );

    for (const entry of existingEntries) {
      entry.delete = true;
      this.logger.debug(`del property: ${key}`, { component });
    }

    return existingEntries.length > 0;
  }

  /**
   * Remove a whole sub-component (e.g. VALARM) from the parsed ICS data.
   * @param {Array} parsed - The parsed ICS data.
   * @param {string} component - The component name to remove.
   */
  removeComponent(parsed, component) {
    for (const item of parsed) {
      // BEGIN and the body carry the component itself, END belongs to the parent.
      if (
        item.component === component ||
        (item.key === "END" && item.value === component)
      ) {
        item.delete = true;
      }
    }
  }

  /**
   * Generate ICS content from the parsed ICS data.
   * @param {Array} parsed - The parsed ICS data.
   * @returns {string} - The generated ICS content.
   */
  generateICS(parsed) {
    const newLines = parsed
      .filter((item) => !item.delete) // Filter out deleted lines
      .map((item) => {
        if (item.modified) {
          return this.buildLine(item);
        }
        return item.original; // Keep the original line
      });

    return newLines.join("\r\n");
  }

  /**
   * Build a line for the ICS content.
   * @param {Object} item - The item to build the line from.
   * @returns {string} - The built line.
   */
  buildLine(item) {
    const params = item.params ? `;${item.params}` : "";
    const dateTimeFields = [
      "DTSTART",
      "DUE",
      "DTEND",
      "CREATED",
      "LAST-MODIFIED",
    ];

    if (dateTimeFields.includes(item.key)) {
      // An all-day property keeps its shorter date-only form.
      const original = item.original.split(":")[1];
      if (original && item.value.length > original.length) {
        item.value = item.value.slice(0, original.length);
      }
    }

    if (item.params === "VALUE=DATE") {
      item.value = item.value.split("T")[0];
    }

    return `${item.key}${params}:${item.value}`;
  }
}

module.exports = VTodoCompleter;
