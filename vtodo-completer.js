const { datetime, RRule } = require('rrule');
const { parse, isValid, max } = require('date-fns');

/**
 * Class representing a VTodoCompleter.
 */
class VTodoCompleter {
    /**
     * Create a VTodoCompleter.
     * @param {Object} webdavClient - The WebDAV client.
     */
    constructor(webdavClient) {
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
    async completeVTodo(filename, completedDate = new Date()) {
        const icsContent = await this.client.getFileContents(filename, { format: 'text' });
        const parsed = this.parseICS(icsContent);

        if (this.isRecurring(parsed)) {
            const newFilename = await this.handleRecurrence(parsed, filename, completedDate);
            return { original: filename, new: newFilename };
        } else {
            const modifiedContent = this.updateNonRecurring(parsed, completedDate);
            await this.client.putFileContents(filename, modifiedContent);
            return { original: filename };
        }
    }

    /**
     * Update a non-recurring VTODO item.
     * @param {Array} parsed - The parsed ICS data.
     * @param {Date} completedDate - The completion date.
     * @returns {string} - The modified ICS content.
     */
    updateNonRecurring(parsed, completedDate) {
        this.addProperty(parsed, 'VTODO', 'COMPLETED', this.formatDate(completedDate), '', 'CREATED');
        this.setProperty(parsed, 'VTODO', 'DTSTAMP', this.formatDate(new Date()));
        this.setProperty(parsed, 'VTODO', 'LAST-MODIFIED', this.formatDate(new Date()));
        this.setProperty(parsed, 'VTODO', 'STATUS', 'COMPLETED');
        this.setProperty(parsed, 'VTODO', 'PERCENT-COMPLETE', '100', 'STATUS');
        return this.generateICS(parsed);
    }

    /**
     * Handle recurrence for a VTODO item.
     * @param {Array} parsed - The parsed ICS data.
     * @param {string} filename - The filename of the VTODO item.
     * @param {Date} completedDate - The completion date.
     * @returns {string} - The new filename for the next occurrence.
     */
    async handleRecurrence(parsed, filename, completedDate) {
        const oDTSTART = this.getElementValue(parsed, 'VTODO', 'DTSTART', true);
        const startDate = this.parseDate(oDTSTART);

        const oRrule = this.getElementLine(parsed, 'VTODO', 'RRULE');
        const rfcString = `DTSTART:${this.formatDate(startDate)}\r\n${oRrule}`;
        const rule = RRule.fromString(rfcString);

        const oDue = this.getElementValue(parsed, 'VTODO', 'DUE', true);
        const nextDue = rule.after(this.parseDatetime(oDue));

        const nextOccurrence = rule.after(new Date(new Date().setHours(0, 0, 0, 0)), false);

        const futureDate = new Date(nextOccurrence);
        futureDate.setDate(futureDate.getDate() + 1);
        const future = rule.after(futureDate, false);
        let maxDate = new Date(Math.max(nextDue, nextOccurrence));

        if (this.parseDatetime(oDue).toISOString() === maxDate.toISOString()) {
            maxDate = future;
        }

        if (!maxDate) {
            console.log('No more occurrences in RRULE');
            const modifiedContent = this.updateNonRecurring(parsed, completedDate);
            await this.client.putFileContents(filename, modifiedContent);
            return filename;
        }

        console.log('RRULE:', rfcString);
        console.log('Next occurrence date:', nextOccurrence);
        console.log('Original due date:', this.parseDatetime(oDue).toISOString());
        console.log('Future date:', futureDate.toISOString());
        console.log('Occurrence from due:', nextDue);
        console.log('Occurrence from future:', future);
        console.log('Set occurrence to:', maxDate);

        // Update the original VTODO item
        this.updateVTodoItem(parsed, maxDate);

        const oldContent = this.generateICS(parsed);
        await this.client.putFileContents(filename, oldContent);

        // Create a new VTODO instance for the next occurrence
        const newParsed = JSON.parse(JSON.stringify(parsed)); // Deep copy of parsed data
        const uid = this.generateUID();

        this.completeNewVTodoItem(newParsed, completedDate, uid);

        const newFilename = `${uid}.ics`;
        const newContent = this.generateICS(newParsed);

        await this.client.putFileContents(newFilename, newContent);
        return newFilename;
    }

    /**
     * Update a VTODO item with a new due date.
     * @param {Array} parsed - The parsed ICS data.
     * @param {Date} maxDate - The new due date.
     */
    updateVTodoItem(parsed, maxDate) {
        console.log(`\r\n\r\nUpdating VTODO item with new due date:`, maxDate.toISOString());
        this.setProperty(parsed, 'VTODO', 'DTSTART', this.formatDate(maxDate));
        this.setProperty(parsed, 'VTODO', 'DUE', this.formatDate(maxDate));
        this.setProperty(parsed, 'VTODO', 'DTSTAMP', this.formatDate(new Date()));
        this.setProperty(parsed, 'VTODO', 'LAST-MODIFIED', this.formatDate(new Date()));

        const trigger = this.getElementValue(parsed, 'VALARM', 'TRIGGER', false);

        if (trigger) {
            const oldAlarmDate = this.parseDate(trigger);
            console.log('old Alarm date:', oldAlarmDate);
            let newAlarmDate = new Date();
            newAlarmDate = new Date(newAlarmDate.setDate(oldAlarmDate.getDate() + 1));

            console.log('new Alarm date:', this.formatDate(maxDate));
            const uid = this.generateUID();

            this.setProperty(parsed, 'VALARM', 'TRIGGER', this.formatDate(maxDate));
            this.setProperty(parsed, 'VALARM', 'UID', uid);
            this.setProperty(parsed, 'VALARM', 'X-WR-ALARMUID', uid);
        }
    }

    /**
     * Complete a new VTODO item for the next occurrence.
     * @param {Array} parsed - The parsed ICS data.
     * @param {Date} completedDate - The completion date.
     * @param {string} uid - The unique identifier.
     */
    completeNewVTodoItem(parsed, completedDate, uid) {
        console.log(`\r\n\r\nCreating new VTODO item for next occurrence`);
        this.addProperty(parsed, 'VTODO', 'COMPLETED', this.formatDate(completedDate), '', 'CREATED');
        this.setProperty(parsed, 'VTODO', 'DTSTAMP', this.formatDate(new Date()));
        this.setProperty(parsed, 'VTODO', 'LAST-MODIFIED', this.formatDate(new Date()));
        this.setProperty(parsed, 'VTODO', 'STATUS', 'COMPLETED');
        this.setProperty(parsed, 'VTODO', 'PERCENT-COMPLETE', '100', 'STATUS');
        this.setProperty(parsed, 'VTODO', 'UID', uid);
    }

    /**
     * Parse a date string.
     * @param {string} dateStr - The date string.
     * @returns {Date} - The parsed date.
     */
    parseDate(dateStr) {
        // Prüfe auf DATE-TIME oder DATE
        const isDateTime = dateStr.includes('T');
        let year, month, day, hours = 0, minutes = 0, seconds = 0;

        if (isDateTime) {
            // DATE-TIME: YYYYMMDDTHHMMSSZ
            const [datePart, timePart] = dateStr.split('T');
            year = parseInt(datePart.substr(0, 4));
            month = parseInt(datePart.substr(4, 2)) - 1; // Monat ist 0-basiert
            day = parseInt(datePart.substr(6, 2));

            const time = timePart.replace('Z', '');
            hours = parseInt(time.substr(0, 2));
            minutes = parseInt(time.substr(2, 2));
            seconds = parseInt(time.substr(4, 2));
        } else {
            // DATE: YYYYMMDD
            year = parseInt(dateStr.substr(0, 4));
            month = parseInt(dateStr.substr(4, 2)) - 1;
            day = parseInt(dateStr.substr(6, 2));
        }

        return new Date(Date.UTC(year, month, day, hours, minutes, seconds));
    }

    /**
     * Parse a datetime string.
     * @param {string} dateStr - The datetime string.
     * @returns {Date} - The parsed datetime.
     */
    parseDatetime(dateStr) {
        // Prüfe auf DATE-TIME oder DATE
        const isDateTime = dateStr.includes('T');
        let year, month, day, hours = 0, minutes = 0, seconds = 0;

        if (isDateTime) {
            // DATE-TIME: YYYYMMDDTHHMMSSZ
            const [datePart, timePart] = dateStr.split('T');
            year = parseInt(datePart.substr(0, 4));
            month = parseInt(datePart.substr(4, 2)); // Monat ist 0-basiert
            day = parseInt(datePart.substr(6, 2));

            const time = timePart.replace('Z', '');
            hours = parseInt(time.substr(0, 2));
            minutes = parseInt(time.substr(2, 2));
            seconds = parseInt(time.substr(4, 2));

            return new datetime(year, month, day, hours, minutes, seconds);
        } else {
            // DATE: YYYYMMDD
            year = parseInt(dateStr.substr(0, 4));
            month = parseInt(dateStr.substr(4, 2));
            day = parseInt(dateStr.substr(6, 2));
            return datetime(year, month, day);
        }
    }

    /**
     * Parse ICS content.
     * @param {string} icsContent - The ICS content.
     * @returns {Array} - An array containing the parsed lines.
     */
    parseICS(icsContent) {
        const lines = icsContent.split('\r\n');
        return lines.map(line => {
            const [keyPart, ...valueParts] = line.split(':');
            const value = valueParts.join(':');
            const [key, ...params] = keyPart.split(';');
            const context = this.getCurrentContext(line);
            return {
                original: line,
                key,
                params: params.join(';'),
                value,
                depth: this.currentDepth,
                component: this.componentStack[this.componentStack.length - 1],
                parent: this.componentStack[this.componentStack.length - 2],
                modified: false
            };
        });
    }

    /**
     * Get the current context from a line.
     * @param {string} line - The line to get the context from.
     * @returns {Object} - The current context.
     */
    getCurrentContext(line) {
        if (line.startsWith('BEGIN:')) {
            this.componentStack.push(line.split(':')[1]);
            this.currentDepth++;
        } else if (line.startsWith('END:')) {
            this.componentStack.pop();
            this.currentDepth = Math.max(0, this.currentDepth - 1);
        }

        return {
            currentComponent: this.componentStack[this.componentStack.length - 1],
            hierarchy: [...this.componentStack] // Kopie des Breadcrumb-Stacks
        };
    }

    /**
     * Check if the VTODO item is recurring.
     * @param {Array} parsed - The parsed ICS data.
     * @returns {boolean} - True if the VTODO item is recurring, false otherwise.
     */
    isRecurring(parsed) {
        return parsed.some(i => i.key === 'RRULE' && i.component === 'VTODO');
    }

    /**
     * Get an element from the parsed ICS data.
     * @param {Array} parsed - The parsed ICS data.
     * @param {string} component - The component name (e.g., 'VTODO').
     * @param {string} key - The property name.
     * @returns {Object|null} - The found element or null if not found.
     */
    getElementLine(parsed, component, key) {
        return parsed.find(i => i.key === key && i.component === component)?.original || null;
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
        const element = parsed.find(i => i.key === key && i.component === component);
        if (!element) return null;
        if (original) {
            return element.original.split(':')[1] || null;
        }
        return element.value || null;
    }

    /**
     * Generate a unique identifier (UID).
     * @returns {string} - The generated UID.
     */
    generateUID() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
            const r = Math.random() * 16 | 0;
            const v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        }).toUpperCase();
    }

    /**
     * Add a new property to the parsed ICS data.
     * @param {Array} parsed - The parsed ICS data.
     * @param {string} component - The component name (e.g., 'VTODO').
     * @param {string} key - The property name (e.g., 'COMPLETED').
     * @param {string} value - The property value.
     * @param {string} [params=''] - The parameters (e.g., 'VALUE=DATE').
     * @param {string} [before='END:VTODO'] - The key before which the new property should be added.
     */
    addProperty(parsed, component, key, value, params = '', before = 'END:VTODO') {
        const newItem = {
            original: '',
            key,
            params,
            value,
            modified: true,
            add: true
        };

        // Find the position of the "END:VTODO" element
        const endIndex = parsed.findIndex(i => i.key === before && i.component === component);

        console.log("component: " + component + " key: " + before + " value: " + value + " params: " + params);
        console.log("add property: " + key + " value: " + value + " at position: " + endIndex);

        if (endIndex !== -1) {
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
        const existingEntries = parsed.filter(i => i.key === key && i.component === component);

        if (existingEntries.length > 0) {
            existingEntries.forEach(entry => {
                entry.delete = true;
                console.log("delete property: " + key);
            });
        } else {
            console.log("cannot delete non-existing property: " + key);
        }
        return true;
    }

    /**
     * Set a property in the parsed ICS data.
     * @param {Array} parsed - The parsed ICS data.
     * @param {string} component - The component name (e.g., 'VTODO').
     * @param {string} key - The property name.
     * @param {string} value - The property value.
     * @param {string} [addBefore='END:VTODO'] - The key before which the new property should be added if it doesn't exist.
     */
    setProperty(parsed, component, key, value, addBefore = 'END:VTODO') {
        const existing = parsed.find(i => i.key === key && i.component === component);
        const origParams = parsed.find(i => i.key === key && i.component === component)?.params;

        if (existing) {
            existing.value = value;
            existing.modified = true;
            console.log("setProperty: " + key + " to " + value);
        } else {
            console.log("cannot modify non-existing property, try to add: " + key + " in front of " + addBefore);
            this.addProperty(parsed, component, key, value, origParams, addBefore);
        }
    }

    /**
     * Format a date according to the specified value type.
     * @param {Date} date - The date to format.
     * @param {string} [valueType='DATE-TIME'] - The value type ('DATE' or 'DATE-TIME').
     * @returns {string} - The formatted date.
     */
    formatDate(date) {
        const isoString = date.toISOString();
        return isoString.replace(/[-:]/g, '').split('.')[0] + 'Z';
    }

    /**
     * Generate ICS content from the parsed ICS data.
     * @param {Array} parsed - The parsed ICS data.
     * @returns {string} - The generated ICS content.
     */
    generateICS(parsed) {
        const newLines = parsed
            .filter(item => !item.delete)   // Filter out deleted lines
            .map(item => {
                if (item.modified) {
                    return this.buildLine(item);
                }
                return item.original; // Keep the original line
            });

        return newLines.join('\r\n');
    }

    /**
     * Build a line for the ICS content.
     * @param {Object} item - The item to build the line from.
     * @returns {string} - The built line.
     */
    buildLine(item) {
        const params = item.params ? `;${item.params}` : '';
        const dateTimeFields = ['DTSTART', 'DUE', 'DTEND', 'CREATED', 'LAST-MODIFIED'];

        if (dateTimeFields.includes(item.key)) {
            let v = item.value;
            let o = item.original.split(':')[1];
            v = v.length > o.length ? v.slice(0, o.length) : v;
            item.value = v;
        }

        if (item.params === 'VALUE=DATE') {
            item.value = item.value.split('T')[0];
        }
        if (item.params === 'VALUE=TIME') {
            item.value = item.value;
        }

        return `${item.key}${params}:${item.value}`;
    }
}

module.exports = VTodoCompleter;
