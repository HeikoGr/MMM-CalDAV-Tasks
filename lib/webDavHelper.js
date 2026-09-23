const { DAVClient } = require("tsdav");
const ical = require("node-ical");
const moment = require("moment");
const { log } = require("./logger");

/*
 * One logged-in client per account, reused across requests: every call used to
 * repeat login and principal discovery, so a single toggle cost three or four
 * of them. Keyed by account so two module instances with different credentials
 * can never share a client - the module-global one they used to share could
 * hand A's calendars back to B when their logins overlapped at boot.
 */
const clients = new Map();
const CLIENT_TTL = 10 * 60 * 1000;

function accountKey(config) {
  const auth = config?.webDavAuth || {};
  return JSON.stringify([auth.url, auth.username, auth.password]);
}

/**
 * Race a request against a timeout. The timer is cleared as soon as the race
 * is decided, so a finished request leaves nothing pending behind.
 * @param {Promise} promise - The request.
 * @param {number} timeout - Timeout in milliseconds.
 * @param {string} operation - Label for the error message.
 * @returns {Promise} The request's result.
 */
async function withTimeout(promise, timeout, operation) {
  let timer = null;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${operation} timed out after ${timeout}ms`)), timeout);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

function deriveNextcloudAccountUrls(config) {
  const serverUrl = config?.webDavAuth?.url;
  const username = config?.webDavAuth?.username;

  if (typeof serverUrl !== "string" || typeof username !== "string") {
    return null;
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(serverUrl);
  } catch {
    return null;
  }

  const davMatch = parsedUrl.pathname.match(/^(.*\/remote\.php\/)(dav|caldav)(\/.*)?$/);
  if (!davMatch) {
    return null;
  }

  const rootUrl = new URL(`${davMatch[1]}dav/`, parsedUrl.origin).href;
  const configuredUserMatch = parsedUrl.pathname.match(/\/remote\.php\/dav\/calendars\/([^/]+)\//);
  const accountUser = configuredUserMatch?.[1] || username;
  const encodedUser = encodeURIComponent(accountUser);

  return {
    rootUrl,
    principalUrl: new URL(`principals/users/${encodedUser}/`, rootUrl).href,
    homeUrl: new URL(`calendars/${encodedUser}/`, rootUrl).href,
  };
}

function shouldRetryWithNextcloudUrls(config, error) {
  const message = error instanceof Error ? error.message : String(error);
  return /cannot find principalurl/i.test(message) && deriveNextcloudAccountUrls(config) !== null;
}

async function performLogin(config) {
  const timeout = config.requestTimeout || 30000;
  const client = initDAVClient(config);

  try {
    await withTimeout(client.login(), timeout, "CalDAV login");
    return client;
  } catch (error) {
    if (!shouldRetryWithNextcloudUrls(config, error)) {
      throw error;
    }

    log.warn("CalDAV principal discovery failed, retrying with explicit Nextcloud DAV URLs");

    client.account = await withTimeout(
      client.createAccount({ account: deriveNextcloudAccountUrls(config) }),
      timeout,
      "CalDAV Nextcloud account discovery",
    );

    return client;
  }
}

async function loginClient(config) {
  const key = accountKey(config);
  const cached = clients.get(key);

  if (cached) {
    if (Date.now() - cached.createdAt < CLIENT_TTL) {
      try {
        // Concurrent callers await the same in-flight login instead of each
        // running their own principal discovery.
        return await cached.promise;
      } catch {
        // A failed login is never kept; fall through and try again.
      }
    }
    clients.delete(key);
  }

  const entry = { createdAt: Date.now(), promise: performLogin(config) };
  clients.set(key, entry);

  try {
    return await entry.promise;
  } catch (error) {
    if (clients.get(key) === entry) {
      clients.delete(key);
    }
    throw error;
  }
}

/**
 * Drop the cached session for an account, e.g. after a request was rejected.
 * @param {Object} config - The module configuration.
 */
function invalidateClient(config) {
  clients.delete(accountKey(config));
}

function initDAVClient(config) {
  return new DAVClient({
    serverUrl: config.webDavAuth.url,
    credentials: {
      username: config.webDavAuth.username,
      password: config.webDavAuth.password,
    },
    authMethod: "Basic",
    defaultAccountType: "caldav",
  });
}

async function getFileContents(config, url) {
  const timeout = config.requestTimeout || 30000;
  const client = await loginClient(config);

  const calendars = await withTimeout(client.fetchCalendars(), timeout, "Fetch calendars");

  const filters = [
    {
      "comp-filter": {
        _attributes: { name: "VCALENDAR" },
        "comp-filter": {
          _attributes: { name: "VTODO" },
        },
      },
    },
  ];

  // Only the calendar owning this object URL can return it - iterating over all
  // of them and keeping the last result silently loses the match.
  const owningCalendar = calendars.find((calendar) => url.startsWith(calendar.url));
  const candidates = owningCalendar ? [owningCalendar] : calendars;

  for (const calendar of candidates) {
    const objects = await withTimeout(
      client.fetchCalendarObjects({
        calendar,
        objectUrls: [url],
        filters,
      }),
      timeout,
      "Fetch calendar objects",
    );

    if (objects?.length) {
      return objects[0];
    }
  }

  throw new Error(`Calendar object not found: ${url}`);
}

async function putFileContents(config, url, data, options = {}) {
  const timeout = config.requestTimeout || 30000;
  const client = await loginClient(config);

  /*
   * A brand-new object must not silently replace an existing one: If-None-Match
   * makes the server reject the write instead, which matters because the new
   * occurrence's URL is derived from a freshly generated UID.
   */
  const headers = options.create ? { "If-None-Match": "*" } : undefined;

  try {
    // try to find the calendar that owns this object URL
    const calendars = await withTimeout(client.fetchCalendars(), timeout, "Fetch calendars");
    const calendar = calendars.find((c) => url.startsWith(c.url));

    const result = await withTimeout(
      client.updateCalendarObject({
        // fallback: without a match let the library work off the object URL alone
        ...(calendar ? { calendar } : {}),
        calendarObject: {
          url,
          data,
        },
        headers,
      }),
      timeout,
      "Write calendar object",
    );

    /*
     * tsdav hands back the raw fetch Response and does not throw on 4xx/5xx.
     * Without this check a rejected PUT (412, 403, quota) was reported to the
     * frontend as a successful toggle.
     */
    if (result && result.ok === false) {
      throw new Error(`CalDAV write failed with ${result.status} ${result.statusText || ""}`.trim());
    }

    return result;
  } catch (err) {
    // The session may have expired mid-write; do not keep serving it.
    invalidateClient(config);
    log.error("putFileContents failed", {
      url,
      message: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}

// node-ical has returned date properties both as bare Dates and as { val } over
// its 0.27.x line, so unwrap defensively rather than pinning a version.
function toDate(value) {
  const raw = value?.val ?? value;
  if (!raw) {
    return null;
  }
  const date = raw instanceof Date ? raw : new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

// An all-day task carries no meaningful time, so drop the time tokens from the
// user's format instead of rendering a misleading "00:00".
function stripTimeTokens(dateFormat) {
  return dateFormat.replace(/[\s,]*H{1,2}[:.]mm(?:[:.]ss)?/g, "").trim();
}

function formatDate(date, dateFormat, dateOnly) {
  return moment(date).format(dateOnly ? stripTimeTokens(dateFormat) : dateFormat);
}

function parseList(icsStrings, dateFormat) {
  const elements = [];

  for (const { filename, icsStr } of icsStrings) {
    const icsObj = ical.sync.parseICS(icsStr);
    Object.values(icsObj).forEach((element) => {
      if (element.type !== "VTODO") {
        return;
      }

      element.filename = filename;

      const due = toDate(element.due);
      const start = toDate(element.start);
      const completed = toDate(element.completed);

      /*
       * Normalize every date to ISO here so the frontend can compare real Date
       * objects. It must never parse the formatted strings back.
       */
      element.dueISO = due ? due.toISOString() : null;
      element.startISO = start ? start.toISOString() : null;
      element.completedISO = completed ? completed.toISOString() : null;
      element.dueDateOnly = Boolean(element.due?.dateOnly);
      element.startDateOnly = Boolean(element.start?.dateOnly);

      if (due) {
        element.dueFormatted = formatDate(due, dateFormat, element.dueDateOnly);
      }
      if (start) {
        element.startFormatted = formatDate(start, dateFormat, element.startDateOnly);
      }

      elements.push(element);
    });
  }

  return elements;
}

function mapEmptyPriorityTo(parsedList, mapEmptyPriorityTo) {
  for (const element of parsedList) {
    if (!Object.hasOwn(element, "priority") || element.priority === null || element.priority === "0") {
      element.priority = mapEmptyPriorityTo.toString();
    }
  }
  return parsedList;
}

function mapEmptySortIndexTo(parsedList, mapEmptySortIndexTo) {
  for (const element of parsedList) {
    if (
      !Object.hasOwn(element, "APPLE-SORT-ORDER") ||
      element["APPLE-SORT-ORDER"] === null ||
      element["APPLE-SORT-ORDER"] === "0"
    ) {
      element["APPLE-SORT-ORDER"] = mapEmptySortIndexTo.toString();
    }
  }
  return parsedList;
}

function filterByNameMatches(objArray, matchStrings) {
  return objArray.filter((obj) =>
    matchStrings.some((matchString) => obj.displayName.toLowerCase().includes(matchString.toLowerCase())),
  );
}

async function fetchCalendarData(config) {
  try {
    return await readCalendarData(config);
  } catch (error) {
    // An expired session must not be served again for the rest of the TTL.
    invalidateClient(config);
    throw error;
  }
}

async function readCalendarData(config) {
  const timeout = config.requestTimeout || 30000;
  const client = await loginClient(config);

  let calendars = await withTimeout(client.fetchCalendars(), timeout, "Fetch calendars");
  calendars = calendars.filter((calendar) => calendar.components.includes("VTODO"));

  // filter NextCloud Decks, as they are read-only
  calendars = calendars.filter((calendar) => !calendar.url.includes("app-generated--deck"));

  // filter by calendars from user config
  if (config.includeCalendars.length > 0) {
    calendars = filterByNameMatches(calendars, config.includeCalendars);
  }

  const calendarData = [];

  const filters = [
    {
      "comp-filter": {
        _attributes: { name: "VCALENDAR" },
        "comp-filter": {
          _attributes: { name: "VTODO" },
        },
      },
    },
  ];

  for (const calendar of calendars) {
    const objects = await withTimeout(
      client.fetchCalendarObjects({
        calendar,
        filters,
      }),
      timeout,
      `Fetch objects from ${calendar.displayName || "calendar"}`,
    );

    const icsStrings = [];
    for (const object of objects) {
      icsStrings.push({ filename: object.url, icsStr: object.data });
    }

    calendarData.push({
      url: calendar.url,
      calendarColor: calendar.calendarColor,
      summary: calendar.displayName,
      description: calendar.description,
      icsStrings,
    });
  }

  return calendarData;
}

module.exports = {
  parseList,
  fetchCalendarData,
  mapEmptyPriorityTo,
  mapEmptySortIndexTo,
  initDAVClient,
  invalidateClient,
  getFileContents,
  putFileContents,
  withTimeout,
};
