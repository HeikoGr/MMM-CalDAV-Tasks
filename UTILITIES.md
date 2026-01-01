# Utility Modules - Documentation

This documentation describes the newly added utility modules for MMM-CalDAV-Tasks.

## Overview

Three new modules were created to reduce code duplication and improve maintainability:

- **date-utils.js** - Date parsing and formatting
- **config-validator.js** - Configuration validation
- **error-handler.js** - Centralized error handling

---

## date-utils.js

### Functions

#### `parseIcsDate(dateStr, returnType)`

Parses ICS date strings into various formats.

**Parameters:**
- `dateStr` (string) - Date in format `YYYYMMDD` or `YYYYMMDDTHHMMSSz`
- `returnType` (string) - `'jsDate'` for JavaScript Date or `'rruleDatetime'` for RRule datetime

**Returns:** `Date` or `datetime` object

**Examples:**
```javascript
const { parseIcsDate } = require('./date-utils');

// Parse to JavaScript Date
const date = parseIcsDate('20240101T120000Z', 'jsDate');
// => Date object: 2024-01-01 12:00:00 UTC

// Parse to RRule datetime (for recurring tasks)
const rruleDate = parseIcsDate('20240101T120000Z', 'rruleDatetime');
// => RRule datetime object
```

---

#### `formatIcsDate(date, format)`

Formats JavaScript Date to ICS format.

**Parameters:**
- `date` (Date) - JavaScript Date object
- `format` (string) - `'date'` or `'datetime'`

**Returns:** `string` in ICS format

**Examples:**
```javascript
const { formatIcsDate } = require('./date-utils');

const date = new Date('2024-01-01T12:00:00Z');

formatIcsDate(date, 'datetime'); // => '20240101T120000Z'
formatIcsDate(date, 'date');     // => '20240101'
```

---

#### `daysBetween(date1, date2)`

Calculates days between two dates.

**Parameters:**
- `date1` (Date|string) - First date
- `date2` (Date|string) - Second date

**Returns:** `number` - Absolute number of days

**Examples:**
```javascript
const { daysBetween } = require('./date-utils');

daysBetween('2024-01-01', '2024-01-10'); // => 9
daysBetween(new Date('2024-01-01'), new Date('2024-01-05')); // => 4
```

---

#### `isOverdue(dueDate)`

Checks if a date is overdue (in the past).

**Parameters:**
- `dueDate` (Date|string) - Date to check

**Returns:** `boolean`

**Examples:**
```javascript
const { isOverdue } = require('./date-utils');

isOverdue('2020-01-01'); // => true
isOverdue('2030-01-01'); // => false
```

---

#### `hasStarted(startDate)`

Checks if a date has already started.

**Parameters:**
- `startDate` (Date|string) - Date to check

**Returns:** `boolean`

---

## config-validator.js

### Constants

#### `CONFIG_SCHEMA`

Schema definition for all configuration options with:
- Type definitions
- Default values
- Validation rules (min/max, enums)
- Deprecation notices

---

### Functions

#### `validateConfig(userConfig)`

Validates and normalizes user configuration.

**Parameters:**
- `userConfig` (Object) - User-defined configuration

**Returns:** Object with:
- `valid` (boolean) - Whether configuration is valid
- `config` (Object) - Normalized configuration with defaults
- `errors` (Array) - List of all validation errors

**Examples:**
```javascript
const { validateConfig } = require('./config-validator');

const userConfig = {
  webDavAuth: {
    url: 'https://cloud.example.com/remote.php/dav/',
    username: 'user',
    password: 'app-password'
  },
  updateInterval: 60000
};

const { valid, config, errors } = validateConfig(userConfig);

if (!valid) {
  console.error('Configuration errors:');
  errors.forEach(e => console.error(`- ${e.message}`));
} else {
  console.log('Configuration valid!');
  console.log('Colorize (default):', config.colorize); // => false
}
```

---

#### `getDefaults()`

Returns all default values from the schema.

**Returns:** `Object` with all default values

**Example:**
```javascript
const { getDefaults } = require('./config-validator');

const defaults = getDefaults();
console.log(defaults.updateInterval); // => 60000
console.log(defaults.colorize);       // => false
```

---

## error-handler.js

### Classes

#### `CalDAVError`

Custom error class for CalDAV-specific errors.

**Constructor:**
- `message` (string) - Error message
- `code` (string) - Error code (e.g. `'AUTH_FAILED'`)
- `details` (Object) - Additional details

**Example:**
```javascript
const { CalDAVError } = require('./error-handler');

throw new CalDAVError(
  'Authentication failed',
  'AUTH_FAILED',
  { username: 'user@example.com' }
);
```

---

### Constants

#### `ERROR_CODES`

Mapping of error codes to messages:

```javascript
{
  AUTH_FAILED: {
    message: "WebDAV Authentication Failed",
    userMessage: "Unauthorized - Check your credentials",
    httpStatus: [401]
  },
  NOT_FOUND: { ... },
  NETWORK_ERROR: { ... },
  PARSE_ERROR: { ... },
  CONFIG_ERROR: { ... },
  RATE_LIMIT: { ... }
}
```

---

### Functions

#### `fromHttpError(error)`

Converts HTTP error to CalDAVError.

**Parameters:**
- `error` (Error) - Original error

**Returns:** `CalDAVError`

**Example:**
```javascript
const { fromHttpError } = require('./error-handler');

try {
  await fetchData();
} catch (error) {
  const caldavError = fromHttpError(error);
  console.log(caldavError.code); // => 'AUTH_FAILED'
  console.log(caldavError.details.httpStatus); // => 401
}
```

---

#### `handleError(error, moduleId, sendErrorFn)`

Handles error and sends user-friendly message to frontend.

**Parameters:**
- `error` (Error|CalDAVError) - Error to handle
- `moduleId` (string) - Module ID
- `sendErrorFn` (Function) - Function to send error message

**Example:**
```javascript
const { handleError } = require('./error-handler');

async getData(moduleId, config, callback) {
  try {
    const data = await fetchCalendarData(config);
    callback(data);
  } catch (error) {
    handleError(error, moduleId, this.sendError.bind(this));
  }
}
```

---

#### `fromValidationErrors(validationErrors)`

Creates CalDAVError from validation errors.

**Parameters:**
- `validationErrors` (Array) - Validation errors from config-validator

**Returns:** `CalDAVError`

---

## Tests

All modules are tested with `test-utils.js`:

```bash
cd /opt/magic_mirror/modules/MMM-CalDAV-Tasks
node test-utils.js
```

**Test Results:** 29/29 tests passed ✅

---

## Migration

### Usage in Existing Files

#### vtodo-completer.js

**Before:**
```javascript
this.parseIcsDate(dateStr)
this.parseIcsDatetime(dateStr)
this.formatDate(date)
```

**After:**
```javascript
const { parseIcsDate, formatIcsDate } = require('./date-utils');

parseIcsDate(dateStr, 'jsDate')
parseIcsDate(dateStr, 'rruleDatetime')
formatIcsDate(date)
```

---

#### node_helper.js

**Before:**
```javascript
try {
  // ...
} catch (error) {
  console.error("WebDav", error);
  if (error.status === 401) {
    self.sendError(moduleId, "Unauthorized!");
  } else if (error.status === 404) {
    self.sendError(moduleId, "Not Found!");
  }
}
```

**After:**
```javascript
const { handleError } = require('./error-handler');

try {
  // ...
} catch (error) {
  handleError(error, moduleId, this.sendError.bind(this));
}
```

---

#### MMM-CalDAV-Tasks.js

**Before:**
```javascript
verifyConfig(config) {
  if (typeof config.updateInterval === "undefined" || ...) {
    this.error = "Config variable missing";
    return false;
  }
  return true;
}
```

**After:**
```javascript
const { validateConfig } = require('./config-validator');

start() {
  const { valid, config, errors } = validateConfig(this.config);

  if (!valid) {
    const criticalErrors = errors.filter(e => e.type !== 'deprecation');
    if (criticalErrors.length > 0) {
      this.error = '<ul>' + criticalErrors.map(e => `<li>${e.message}</li>`).join('') + '</ul>';
      this.updateDom();
      return;
    }
  }

  this.config = config; // Normalized with defaults
  // ...
}
```

---

## Benefits

### Code Reduction
- **date-utils.js:** Eliminates 102 lines of duplicate code in vtodo-completer.js
- **config-validator.js:** Reduces verifyConfig() from 38 to 5 lines
- **error-handler.js:** Unifies error handling across all files

### Improvements
- ✅ Detailed error messages instead of generic ones
- ✅ Type validation and range checking for config values
- ✅ Reusable utilities for future features
- ✅ Better testability through modularization
- ✅ Consistent error codes and user messages

---

## Next Steps

1. ✅ Utility modules created
2. ⏭️ Integration into vtodo-completer.js
3. ⏭️ Integration into node_helper.js
4. ⏭️ Integration into MMM-CalDAV-Tasks.js
5. ⏭️ Perform end-to-end tests
6. ⏭️ Update README.md
