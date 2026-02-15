/**
 * Configuration schema for MMM-CalDAV-Tasks
 * Defines all valid configuration options with types, defaults, and validation rules
 */
const CONFIG_SCHEMA = {
    // Required
    webDavAuth: {
        type: "object",
        required: true,
        schema: {
            url: { type: "string", required: true },
            username: { type: "string", required: true },
            password: { type: "string", required: true }
        }
    },

    // Optional with defaults
    includeCalendars: { type: "array", default: [] },
    updateInterval: { type: "number", default: 60000, min: 1000 },
    sortMethod: {
        type: "string",
        default: "priority",
        enum: [
            "priority",
            "priority desc",
            "created",
            "created desc",
            "modified",
            "modified desc"
        ]
    },
    colorize: { type: "boolean", default: false },
    startsInDays: { type: "number", default: 999999, min: 0 },
    dueInDays: { type: "number", default: 999999, min: 0 },
    displayStartDate: { type: "boolean", default: true },
    displayDueDate: { type: "boolean", default: true },
    showWithoutStart: { type: "boolean", default: true },
    showWithoutDue: { type: "boolean", default: true },
    hideCompletedTasksAfter: { type: "number", default: 1, min: 0 },
    dateFormat: { type: "string", default: "DD.MM.YYYY" },
    headings: { type: "array", default: [null] },
    playSound: { type: "boolean", default: true },
    toggleTime: { type: "number", default: 1000, min: 100 },
    showCompletionPercent: { type: "boolean", default: false },
    mapEmptyPriorityTo: { type: "number", default: 5, min: 1, max: 9 },
    mapEmptySortIndexTo: { type: "number", default: 999999 },
    highlightStartedTasks: { type: "boolean", default: true },
    highlightOverdueTasks: { type: "boolean", default: true },
    pieChartBackgroundColor: {
        type: "string",
        default: "rgb(138, 138, 138)"
    },
    pieChartColor: { type: "string", default: "rgb(255, 255, 255)" },
    pieChartSize: { type: "number", default: 16, min: 1 },
    hideDateSectionOnCompletion: { type: "boolean", default: true },
    developerMode: { type: "boolean", default: false },

    // Deprecated (for migration warnings)
    hideCompletedTasks: {
        deprecated: true,
        replacedBy: "hideCompletedTasksAfter"
    },
    listUrl: {
        deprecated: true,
        replacedBy: "webDavAuth.url + includeCalendars"
    }
};

/**
 * Validate a single config value against its schema
 * @private
 * @param {string} key - Config key
 * @param {*} value - Config value
 * @param {Object} schema - Schema definition
 * @returns {Array<Object>} Array of validation errors
 */
function validateValue(key, value, schema) {
    const errors = [];

    // Type check
    const actualType = Array.isArray(value) ? "array" : typeof value;
    if (actualType !== schema.type) {
        errors.push({
            type: "type",
            key,
            expected: schema.type,
            actual: actualType,
            message: `"${key}" must be ${schema.type}, got ${actualType}.`
        });
        return errors; // Stop further validation if type is wrong
    }

    // Enum check
    if (schema.enum && !schema.enum.includes(value)) {
        errors.push({
            type: "enum",
            key,
            message: `"${key}" must be one of: ${schema.enum.join(", ")}`
        });
    }

    // Range check for numbers
    if (schema.type === "number") {
        if (schema.min !== undefined && value < schema.min) {
            errors.push({
                type: "range",
                key,
                message: `"${key}" must be >= ${schema.min}, got ${value}`
            });
        }
        if (schema.max !== undefined && value > schema.max) {
            errors.push({
                type: "range",
                key,
                message: `"${key}" must be <= ${schema.max}, got ${value}`
            });
        }
    }

    // Nested object validation
    if (schema.schema && typeof value === "object" && !Array.isArray(value)) {
        for (const [nestedKey, nestedSchema] of Object.entries(schema.schema)) {
            const nestedValue = value[nestedKey];

            // Required check for nested properties
            if (nestedSchema.required && nestedValue === undefined) {
                errors.push({
                    type: "missing",
                    key: `${key}.${nestedKey}`,
                    message: `Required config "${key}.${nestedKey}" is missing.`
                });
                continue;
            }

            // Validate nested value if present
            if (nestedValue !== undefined) {
                const nestedErrors = validateValue(
                    `${key}.${nestedKey}`,
                    nestedValue,
                    nestedSchema
                );
                errors.push(...nestedErrors);
            }
        }
    }

    return errors;
}

/**
 * Validate and normalize configuration
 * @param {Object} userConfig - User-provided configuration
 * @param {Object} [schema=CONFIG_SCHEMA] - Configuration schema to validate against
 * @returns {{valid: boolean, config: Object, errors: Array}} Validation result
 *
 * @example
 * const { valid, config, errors } = validateConfig(userConfig);
 * if (!valid) {
 *   console.error('Config errors:', errors);
 * }
 */
function validateConfig(userConfig, schema = CONFIG_SCHEMA) {
    const errors = [];
    const config = {};

    for (const [key, schemaEntry] of Object.entries(schema)) {
        // Deprecation warning
        if (schemaEntry.deprecated && userConfig[key] !== undefined) {
            errors.push({
                type: "deprecation",
                key,
                message: `"${key}" is deprecated. Use "${schemaEntry.replacedBy}" instead.`
            });
            continue;
        }

        const value = userConfig[key];

        // Required check
        if (schemaEntry.required && value === undefined) {
            errors.push({
                type: "missing",
                key,
                message: `Required config "${key}" is missing.`
            });
            continue;
        }

        // Use default if not provided
        if (value === undefined) {
            if (schemaEntry.default !== undefined) {
                config[key] = schemaEntry.default;
            }
            continue;
        }

        // Validate the value
        const valueErrors = validateValue(key, value, schemaEntry);
        errors.push(...valueErrors);

        // Add to config if no critical errors
        if (valueErrors.length === 0) {
            config[key] = value;
        }
    }

    return {
        valid: errors.filter((e) => e.type !== "deprecation").length === 0,
        config,
        errors
    };
}

/**
 * Get all default values from schema
 * @returns {Object} Object with all default configuration values
 */
function getDefaults() {
    const defaults = {};

    for (const [key, schema] of Object.entries(CONFIG_SCHEMA)) {
        if (schema.default !== undefined) {
            defaults[key] = schema.default;
        }
    }

    return defaults;
}

module.exports = {
    CONFIG_SCHEMA,
    validateConfig,
    getDefaults
};
