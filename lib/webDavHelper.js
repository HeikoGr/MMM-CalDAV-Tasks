const { DAVClient } = require("tsdav");
const ical = require("node-ical");
const moment = require("moment");
const { log } = require("./logger");

/*
 * One logged-in client per account, reused across requests and fetch cycles.
 * With Basic auth every request carries the credentials, so there is no server
 * session to expire: login() only discovers the principal and calendar home
 * (several PROPFINDs). That result stays valid until a request fails, which
 * discards the client (fetchCalendarData, putFileContents); CLIENT_MAX_AGE_MS
 * repeats the discovery once a day regardless. Keyed by account, so instances
 * with different credentials never share a client.
 */
const clients = new Map();
const CLIENT_MAX_AGE_MS = 24 * 60 * 60 * 1000;

/*
 * Task objects per calendar, reused while the calendar's ctag is unchanged: a
 * fetch cycle then costs one PROPFIND (the calendar list, which carries the
 * ctags) instead of one REPORT per calendar. Any change on the server - also a
 * toggle from this module - gives the calendar a new ctag. A calendar without
 * a ctag is always fetched.
 */
const objectCache = new Map(); // accountKey|calendarUrl -> { ctag, icsStrings }

// Calendars whose objects are fetched at the same time.
const CALENDAR_FETCH_CONCURRENCY = 4;

/**
 * List the calendars of the account with one PROPFIND on the calendar home.
 * DAVClient.fetchCalendars() asks every calendar for its supported reports on
 * top (one PROPFIND each), which only its smartCollectionSync uses.
 * @param {DAVClient} client - Logged-in client.
 * @param {AbortSignal} [signal] - Cancels the request.
 * @returns {Promise<Array>} Calendars shaped like fetchCalendars() returns them, without `reports`.
 */
async function listCalendars(client, signal) {
  const responses = await client.propfind({
    url: client.account.homeUrl,
    props: {
      "c:calendar-description": {},
      "d:displayname": {},
      "ca:calendar-color": {},
      "cs:getctag": {},
      "d:resourcetype": {},
      "c:supported-calendar-component-set": {},
    },
    depth: "1",
    fetchOptions: { ...client.fetchOptions, ...(signal ? { signal } : {}) },
  });
  return responses
    .filter((response) => Object.keys(response.props?.resourcetype ?? {}).includes("calendar"))
    .map((response) => {
      const props = response.props ?? {};
      const compSet = props.supportedCalendarComponentSet?.comp;
      const components = (Array.isArray(compSet) ? compSet : compSet ? [compSet] : [])
        .map((component) => component?._attributes?.name)
        .filter((name) => typeof name === "string" && name.length > 0);
      return {
        url: new URL(response.href ?? "", `${client.account.rootUrl.replace(/\/?$/, "/")}`).href,
        ctag: props.getctag,
        calendarColor: props.calendarColor,
        displayName: props.displayname?._cdata ?? props.displayname,
        description: typeof props.calendarDescription === "string" ? props.calendarDescription : "",
        components,
      };
    });
}

/**
 * Drop cached objects of calendars the server no longer lists for this account.
 * @param {Object} config - The module configuration.
 * @param {Array} calendars - All task calendars the server lists.
 */
function forgetUnlistedCalendars(config, calendars) {
  const prefix = `${accountKey(config)}|`;
  const listed = new Set(calendars.map((calendar) => `${prefix}${calendar.url}`));
  for (const cacheKey of objectCache.keys()) {
    if (cacheKey.startsWith(prefix) && !listed.has(cacheKey)) objectCache.delete(cacheKey);
  }
}

/**
 * map() with an async callback and at most `limit` calls in flight; results keep the input order.
 */
async function mapWithConcurrency(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index]);
    }
  });
  await Promise.all(workers);
  return results;
}

function accountKey(config) {
  const auth = config?.webDavAuth || {};
  return JSON.stringify([auth.url, auth.username, auth.password]);
}

/**
 * Race a request against a timeout. The timer is cleared as soon as the race
 * is decided, so a finished request leaves nothing pending behind. Passed as a
 * function, the request gets an AbortSignal that fires on timeout, so the
 * losing HTTP request is cancelled instead of running on in the background.
 * @param {Promise|function(AbortSignal): Promise} request - The request, or a function starting it.
 * @param {number} timeout - Timeout in milliseconds.
 * @param {string} operation - Label for the error message.
 * @returns {Promise} The request's result.
 */
async function withTimeout(request, timeout, operation) {
  const controller = new AbortController();
  const promise = typeof request === "function" ? request(controller.signal) : request;
  let timer = null;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          reject(new Error(`${operation} timed out after ${timeout}ms`));
          controller.abort();
        }, timeout);
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
    if (Date.now() - cached.createdAt < CLIENT_MAX_AGE_MS) {
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

  const calendars = await withTimeout((signal) => listCalendars(client, signal), timeout, "Fetch calendars");

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
    const calendars = await withTimeout((signal) => listCalendars(client, signal), timeout, "Fetch calendars");
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
      // Only sorting and colors use the mapped value; the "!" mark must not.
      element.priorityUnset = true;
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
    matchStrings.some((matchString) =>
      String(obj.displayName ?? "")
        .toLowerCase()
        .includes(matchString.toLowerCase()),
    ),
  );
}

// Nextcloud appends " (<owner display name>)" to calendars shared with the user; the
// owner is not part of the calendar's own name, so drop it for those calendars only.
function calendarDisplayName(calendar) {
  const name = calendar.displayName || "";
  if (!calendar.url?.includes("_shared_by_")) {
    return name;
  }
  return name.replace(/\s*\([^()]*\)\s*$/, "") || name;
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

  let calendars = await withTimeout((signal) => listCalendars(client, signal), timeout, "Fetch calendars");
  // A server may leave out supported-calendar-component-set; such a calendar is skipped, not fatal.
  calendars = calendars.filter((calendar) => calendar.components?.includes("VTODO"));
  forgetUnlistedCalendars(config, calendars);

  // filter NextCloud Decks, as they are read-only
  calendars = calendars.filter((calendar) => !calendar.url.includes("app-generated--deck"));

  // filter by calendars from user config
  if (config.includeCalendars.length > 0) {
    calendars = filterByNameMatches(calendars, config.includeCalendars);
  }

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

  const account = accountKey(config);
  const calendarData = await mapWithConcurrency(calendars, CALENDAR_FETCH_CONCURRENCY, async (calendar) => {
    const cacheKey = `${account}|${calendar.url}`;
    const cached = objectCache.get(cacheKey);
    let icsStrings;
    if (calendar.ctag && cached?.ctag === calendar.ctag) {
      icsStrings = cached.icsStrings;
    } else {
      const objects = await withTimeout(
        (signal) =>
          client.fetchCalendarObjects({
            calendar,
            filters,
            fetchOptions: { ...client.fetchOptions, signal },
          }),
        timeout,
        `Fetch objects from ${calendar.displayName || "calendar"}`,
      );
      icsStrings = objects.map((object) => ({ filename: object.url, icsStr: object.data }));
      if (calendar.ctag) objectCache.set(cacheKey, { ctag: calendar.ctag, icsStrings });
    }

    return {
      url: calendar.url,
      calendarColor: calendar.calendarColor,
      summary: calendarDisplayName(calendar),
      description: calendar.description,
      icsStrings,
    };
  });

  return calendarData;
}

module.exports = {
  parseList,
  calendarDisplayName,
  fetchCalendarData,
  mapEmptyPriorityTo,
  mapEmptySortIndexTo,
  initDAVClient,
  invalidateClient,
  listCalendars,
  getFileContents,
  putFileContents,
  withTimeout,
};
