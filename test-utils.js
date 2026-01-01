/**
 * Test suite for utility modules
 * Run with: node test-utils.js
 */

// Import utilities
const {
    parseIcsDate,
    formatIcsDate,
    daysBetween,
    isOverdue
} = require("./date-utils");
const { validateConfig, getDefaults } = require("./config-validator");
const { CalDAVError, fromHttpError, ERROR_CODES } = require("./error-handler");

let passedTests = 0;
let failedTests = 0;

function assert(condition, message) {
    if (condition) {
        passedTests++;
        console.log(`✓ ${message}`);
    } else {
        failedTests++;
        console.error(`✗ ${message}`);
    }
}

function assertEquals(actual, expected, message) {
    if (JSON.stringify(actual) === JSON.stringify(expected)) {
        passedTests++;
        console.log(`✓ ${message}`);
    } else {
        failedTests++;
        console.error(`✗ ${message}`);
        console.error(`  Expected: ${JSON.stringify(expected)}`);
        console.error(`  Actual: ${JSON.stringify(actual)}`);
    }
}

console.log("\n=== Testing date-utils.js ===\n");

// Test parseIcsDate
try {
    const date1 = parseIcsDate("20240101T120000Z", "jsDate");
    assert(date1 instanceof Date, "parseIcsDate returns Date object");
    assertEquals(
        date1.getUTCFullYear(),
        2024,
        "parseIcsDate parses year correctly"
    );
    assertEquals(
        date1.getUTCMonth(),
        0,
        "parseIcsDate parses month correctly (0-indexed)"
    );
    assertEquals(date1.getUTCDate(), 1, "parseIcsDate parses day correctly");
    assertEquals(date1.getUTCHours(), 12, "parseIcsDate parses hours correctly");
} catch (e) {
    failedTests++;
    console.error(`✗ parseIcsDate test failed: ${e.message}`);
}

// Test formatIcsDate
try {
    const testDate = new Date("2024-01-01T12:00:00Z");
    const formatted = formatIcsDate(testDate, "datetime");
    assertEquals(
        formatted,
        "20240101T120000Z",
        "formatIcsDate formats datetime correctly"
    );

    const dateOnly = formatIcsDate(testDate, "date");
    assertEquals(
        dateOnly,
        "20240101",
        "formatIcsDate formats date-only correctly"
    );
} catch (e) {
    failedTests++;
    console.error(`✗ formatIcsDate test failed: ${e.message}`);
}

// Test daysBetween
try {
    const days = daysBetween("2024-01-01", "2024-01-10");
    assertEquals(days, 9, "daysBetween calculates correctly");
} catch (e) {
    failedTests++;
    console.error(`✗ daysBetween test failed: ${e.message}`);
}

// Test isOverdue
try {
    assert(isOverdue("2020-01-01"), "isOverdue returns true for past dates");
    assert(!isOverdue("2030-01-01"), "isOverdue returns false for future dates");
} catch (e) {
    failedTests++;
    console.error(`✗ isOverdue test failed: ${e.message}`);
}

console.log("\n=== Testing config-validator.js ===\n");

// Test valid config
try {
    const validConfig = {
        webDavAuth: {
            url: "https://example.com",
            username: "user",
            password: "pass"
        },
        updateInterval: 60000
    };

    const result = validateConfig(validConfig);
    assert(result.valid, "validateConfig accepts valid config");
    assert(
        result.errors.length === 0,
        "validateConfig returns no errors for valid config"
    );
    assert(result.config.colorize === false, "validateConfig applies defaults");
} catch (e) {
    failedTests++;
    console.error(`✗ validateConfig valid config test failed: ${e.message}`);
}

// Test missing required field
try {
    const invalidConfig = {
        updateInterval: 60000
    };

    const result = validateConfig(invalidConfig);
    assert(!result.valid, "validateConfig rejects missing required field");
    assert(result.errors.length > 0, "validateConfig returns errors");
    assert(
        result.errors[0].type === "missing",
        "validateConfig identifies missing field"
    );
} catch (e) {
    failedTests++;
    console.error(`✗ validateConfig missing field test failed: ${e.message}`);
}

// Test type validation
try {
    const wrongTypeConfig = {
        webDavAuth: {
            url: "https://example.com",
            username: "user",
            password: "pass"
        },
        updateInterval: "not a number"
    };

    const result = validateConfig(wrongTypeConfig);
    assert(!result.valid, "validateConfig rejects wrong type");
    const typeError = result.errors.find((e) => e.type === "type");
    assert(typeError !== undefined, "validateConfig identifies type error");
} catch (e) {
    failedTests++;
    console.error(`✗ validateConfig type test failed: ${e.message}`);
}

// Test range validation
try {
    const outOfRangeConfig = {
        webDavAuth: {
            url: "https://example.com",
            username: "user",
            password: "pass"
        },
        updateInterval: 500, // min is 1000
        mapEmptyPriorityTo: 15 // max is 9
    };

    const result = validateConfig(outOfRangeConfig);
    assert(!result.valid, "validateConfig rejects out-of-range values");
    const rangeErrors = result.errors.filter((e) => e.type === "range");
    assert(
        rangeErrors.length === 2,
        "validateConfig identifies both range errors"
    );
} catch (e) {
    failedTests++;
    console.error(`✗ validateConfig range test failed: ${e.message}`);
}

// Test getDefaults
try {
    const defaults = getDefaults();
    assertEquals(
        defaults.updateInterval,
        60000,
        "getDefaults returns correct default"
    );
    assertEquals(defaults.colorize, false, "getDefaults returns all defaults");
} catch (e) {
    failedTests++;
    console.error(`✗ getDefaults test failed: ${e.message}`);
}

console.log("\n=== Testing error-handler.js ===\n");

// Test CalDAVError creation
try {
    const error = new CalDAVError("Test error", "TEST_CODE", { detail: "test" });
    assert(error instanceof Error, "CalDAVError is an Error instance");
    assertEquals(error.code, "TEST_CODE", "CalDAVError stores code");
    assertEquals(error.details.detail, "test", "CalDAVError stores details");
} catch (e) {
    failedTests++;
    console.error(`✗ CalDAVError test failed: ${e.message}`);
}

// Test fromHttpError
try {
    const httpError = { status: 401 };
    const caldavError = fromHttpError(httpError);
    assertEquals(
        caldavError.code,
        "AUTH_FAILED",
        "fromHttpError maps 401 to AUTH_FAILED"
    );

    const httpError404 = { status: 404 };
    const caldavError404 = fromHttpError(httpError404);
    assertEquals(
        caldavError404.code,
        "NOT_FOUND",
        "fromHttpError maps 404 to NOT_FOUND"
    );
} catch (e) {
    failedTests++;
    console.error(`✗ fromHttpError test failed: ${e.message}`);
}

// Test ERROR_CODES
try {
    assert(
        ERROR_CODES.AUTH_FAILED !== undefined,
        "ERROR_CODES contains AUTH_FAILED"
    );
    assert(
        ERROR_CODES.AUTH_FAILED.userMessage !== undefined,
        "ERROR_CODES has user messages"
    );
} catch (e) {
    failedTests++;
    console.error(`✗ ERROR_CODES test failed: ${e.message}`);
}

// Print summary
console.log("\n=== Test Summary ===\n");
console.log(`✓ Passed: ${passedTests}`);
console.log(`✗ Failed: ${failedTests}`);
console.log(`Total: ${passedTests + failedTests}`);

if (failedTests > 0) {
    console.error("\n❌ Some tests failed!");
    throw new Error(`${failedTests} test(s) failed`);
} else {
    console.log("\n✅ All tests passed!");
}
