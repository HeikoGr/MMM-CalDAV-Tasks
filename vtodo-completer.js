const { RRule } = require("rrule");
const { getFileContents, putFileContents } = require("./webDavHelper");
const { parseIcsDate, formatIcsDate } = require("./date-utils");

/**
 * Class representing a VTodoCompleter.
 */
class VTodoCompleter {
  /**
   * Create a VTodoCompleter.
   * @param {Object} webdavClient - The tsdav webdav client.
   */
  constructor(webdavClient) {
    if (!webdavClient) {
      throw new Error("WebDAV client is required");
    }
    this.client = webdavClient;
    this.componentStack = [];
    this.currentDepth = 0;
  }

  /**
   * Complete a VTODO item.
   * @param {string} filename - The filename of the VTODO item.
   * @param {Date} [completedDate=new Date()] - The completion date.
   * @returns {Object} - An object containing the original filename.
   */
  async completeVTodo(config, filename, completedDate = new Date()) {
    console.log(`Completing VTODO: ${filename}`);

    const icsContent = await getFileContents(config, filename);
    const parsed = this.parseICS(icsContent.data);

    if (this.isRecurring(parsed)) {
      console.log("VTODO is recurring");
      const newFilename = await this.handleRecurrence(
        config,
        parsed,
        filename,
        completedDate
      );
      return { original: filename, new: newFilename };
    }
    console.log("VTODO is not recurring");
    await this.updateNonRecurring(config, parsed, filename, completedDate);
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
   * @param {Array} parsed - The parsed ICS data.
   * @param {Date} completedDate - The completion date.
   * @returns {string} - The modified ICS content.
   */
  async updateNonRecurring(config, parsed, filename, completedDate) {
    console.log("\r\n\r\nUpdating non-recurring VTODO item");

    this.setProperty(
      parsed,
      "VTODO",
      "COMPLETED",
      formatIcsDate(completedDate),
      "CREATED"
    );
    this.setProperty(parsed, "VTODO", "DTSTAMP", formatIcsDate(new Date()));
    this.setProperty(
      parsed,
      "VTODO",
      "LAST-MODIFIED",
      formatIcsDate(new Date())
    );
    this.setProperty(parsed, "VTODO", "STATUS", "COMPLETED");
    this.setProperty(parsed, "VTODO", "PERCENT-COMPLETE", "100", "STATUS");

    await putFileContents(config, filename, this.generateICS(parsed));
    return filename;
  }

  /**
   * Handle recurrence for a VTODO item.
   * @param {Array} parsed - The parsed ICS data.
   * @param {string} filename - The filename of the VTODO item.
   * @param {Date} completedDate - The completion date.
   * @returns {string} - The new filename for the next occurrence.
   */
  async handleRecurrence(config, parsed, filename, completedDate) {
    console.log("\r\n\r\nHandling recurrence for VTODO item");

    const originalRRULE = this.getElementLine(parsed, "VTODO", "RRULE");
    const originalDTSTART = this.getElementValue(
      parsed,
      "VTODO",
      "DTSTART",
      true
    );
    const startDate = parseIcsDate(originalDTSTART, "jsDate");
    const rfcString = `DTSTART:${formatIcsDate(startDate)}\r\n${originalRRULE}`;
    const originalDue = this.getElementValue(parsed, "VTODO", "DUE", true);
    const originalUID = this.getElementValue(parsed, "VTODO", "UID", true);

    const rule = RRule.fromString(rfcString);
    const occurenceAfterDue = rule.after(
      parseIcsDate(originalDue, "rruleDatetime")
    );
    const occurenceAfterToday = rule.after(
      new Date(new Date().setHours(0, 0, 0, 0)),
      false
    );

    const futureDate = new Date(occurenceAfterToday);
    futureDate.setDate(futureDate.getDate() + 1);
    const occurenceAfterFuture = rule.after(futureDate, false);

    // compare next occurence with due date
    let maxDate = new Date(Math.max(occurenceAfterDue, occurenceAfterToday));

    // compare next occurence with occurence after today+1
    if (
      parseIcsDate(originalDue, "rruleDatetime").toISOString() ===
      maxDate.toISOString()
    ) {
      maxDate = occurenceAfterFuture;
    }

    if (!maxDate) {
      console.log("No more occurrences in RRULE");
      const newFilename = await this.updateNonRecurring(
        config,
        parsed,
        completedDate
      );
      return newFilename;
    }

    console.log(
      "RRULE:                  ",
      rfcString.replace(/\r\n/g, "[newLine]")
    );
    console.log(
      "actual due date:        ",
      parseIcsDate(originalDue, "rruleDatetime").toISOString()
    );
    console.log("occurrence after today: ", occurenceAfterToday);
    console.log("occurence after today+1:", futureDate.toISOString());
    console.log("occurrence after due:   ", occurenceAfterDue);
    console.log("Set occurrence to:      ", maxDate);

    // Update the original VTODO item
    this.updateVTodoItem(parsed, maxDate);

    const oldContent = this.generateICS(parsed);
    await putFileContents(config, filename, oldContent);

    // Create a new VTODO instance for the next occurrence
    const newParsed = JSON.parse(JSON.stringify(parsed)); // Deep copy of parsed data
    const uid = this.generateUID();

    console.log("\r\n\r\nCreating new VTODO item for next occurrence");
    this.setProperty(
      parsed,
      "VTODO",
      "COMPLETED",
      formatIcsDate(completedDate),
      "CREATED"
    );
    this.setProperty(parsed, "VTODO", "DTSTAMP", formatIcsDate(new Date()));
    this.setProperty(
      parsed,
      "VTODO",
      "LAST-MODIFIED",
      formatIcsDate(new Date())
    );
    this.setProperty(parsed, "VTODO", "STATUS", "", "COMPLETED");
    this.setProperty(parsed, "VTODO", "PERCENT-COMPLETE", "100", "STATUS");
    this.setProperty(parsed, "VTODO", "UID", uid);

    this.completeNewVTodoItem(newParsed, completedDate, uid);
    const newFilename = filename.replace(originalUID, uid);

    const newContent = this.generateICS(newParsed);
    const result = await putFileContents(config, newFilename, newContent);
    return result;
  }

  /**
   * Update a VTODO item with a new due date.
   * @param {Array} parsed - The parsed ICS data.
   * @param {Date} maxDate - The new due date.
   */
  updateVTodoItem(parsed, maxDate) {
    console.log("\r\n\r\nUpdating existing VTODO item:");
    this.setProperty(parsed, "VTODO", "DTSTART", formatIcsDate(maxDate));
    this.setProperty(parsed, "VTODO", "DUE", formatIcsDate(maxDate));
    this.setProperty(parsed, "VTODO", "DTSTAMP", formatIcsDate(new Date()));
    this.setProperty(
      parsed,
      "VTODO",
      "LAST-MODIFIED",
      formatIcsDate(new Date())
    );

    const trigger = this.getElementValue(parsed, "VALARM", "TRIGGER", false);

    if (trigger) {
      const oldAlarmDate = parseIcsDate(trigger, "jsDate");
      console.log("old Alarm date:", oldAlarmDate);
      // removed unused newAlarmDate variable

      console.log("new Alarm date:", formatIcsDate(maxDate));
      const uid = this.generateUID();

      this.setProperty(parsed, "VALARM", "TRIGGER", formatIcsDate(maxDate));
      this.setProperty(parsed, "VALARM", "UID", uid);
      this.setProperty(parsed, "VALARM", "X-WR-ALARMUID", uid);
    }
  }

  /**
   * Parse ICS content.
   * @param {string} icsContent - The ICS content.
   * @returns {Array} - An array containing the parsed lines.
   */
  parseICS(icsContent) {
    const lines = icsContent.split("\n");
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
        modified: false
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
      hierarchy: [...this.componentStack]
    };
  }

  /**
   * Generate a unique identifier (UID) for ICS entries.
   * @returns {string} RFC4122 version 4 compliant UUID in uppercase
   */
  generateUID() {
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c == "x" ? r : (r & 0x3) | 0x8;
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
      parsed.find((i) => i.key === key && i.component === component)
        ?.original || null
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
      (i) => i.key === key && i.component === component
    );
    if (!element) {
      return null;
    }
    if (original) {
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
      (i) => i.key === key && i.component === component
    );
    const origParams = parsed.find(
      (i) => i.key === key && i.component === component
    )?.params;

    if (existing) {
      existing.value = value;
      existing.modified = true;
      existing.params = origParams;
      console.log(`set property:   ${key} to ${value}`);
    } else {
      console.log(
        `cannot modify non-existing property, try to add: ${key} in front of ${addBefore}`
      );
      this.addProperty(parsed, component, key, value, origParams, addBefore);
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
      component: "VTODO",
      parent: "VCALENDAR",
      modified: true,
      add: true
    };

    // Find the position of the "END:VTODO" element
    if (addBefore === "END") {
      component = "VCALENDAR";
    }
    const endIndex = parsed.findIndex(
      (i) => i.key === addBefore && i.component === component
    );

    console.log(
      `component:      ${component} key: ${addBefore} value: ${value} params: ${params}`
    );
    console.log(
      `add property:   ${key} value: ${value} at position: ${endIndex}`
    );

    if (endIndex !== -1) {
      console.log(`inserting new item at position: ${endIndex}`);
      // Insert the new item before the "END:VTODO" element
      parsed.splice(endIndex, 0, newItem);
    } else {
      // If "END:VTODO" is not found, push the new item to the end
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
      (i) => i.key === key && i.component === component
    );

    if (existingEntries.length > 0) {
      existingEntries.forEach((entry) => {
        entry.delete = true;
        console.log(`del property:   ${key}`);
      });
    } else {
      console.log(`cannot delete non-existing property: ${key}`);
    }
    return true;
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
      "LAST-MODIFIED"
    ];

    if (dateTimeFields.includes(item.key)) {
      let v = item.value;
      const o = item.original.split(":")[1];
      if (o) {
        v = v.length > o.length ? v.slice(0, o.length) : v;
        item.value = v;
      }
    }

    if (item.params === "VALUE=DATE") {
      item.value = item.value.split("T")[0];
    }
    // removed self-assignment for VALUE=TIME

    return `${item.key}${params}:${item.value}`;
  }
}

module.exports = VTodoCompleter;
