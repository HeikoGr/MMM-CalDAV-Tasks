const { DAVClient } = require("tsdav");
const ical = require("node-ical");
const moment = require("moment");

let client;

function createTimeoutPromise(timeout, operation) {
  return new Promise((_, reject) =>
    setTimeout(
      () => reject(new Error(`${operation} timed out after ${timeout}ms`)),
      timeout,
    ),
  );
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
  const configuredUserMatch = parsedUrl.pathname.match(
    /\/remote\.php\/dav\/calendars\/([^/]+)\//,
  );
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
  return (
    /cannot find principalurl/i.test(message) &&
    deriveNextcloudAccountUrls(config) !== null
  );
}

async function loginClient(config) {
  const timeout = config.requestTimeout || 30000;
  client = initDAVClient(config);

  try {
    await Promise.race([
      client.login(),
      createTimeoutPromise(timeout, "CalDAV login"),
    ]);
    return client;
  } catch (error) {
    if (!shouldRetryWithNextcloudUrls(config, error)) {
      throw error;
    }

    console.warn(
      "CalDAV principal discovery failed; retrying with explicit Nextcloud DAV URLs.",
    );

    client.account = await Promise.race([
      client.createAccount({ account: deriveNextcloudAccountUrls(config) }),
      createTimeoutPromise(timeout, "CalDAV Nextcloud account discovery"),
    ]);

    return client;
  }
}

function initDAVClient(config) {
  client = new DAVClient({
    serverUrl: config.webDavAuth.url,
    credentials: {
      username: config.webDavAuth.username,
      password: config.webDavAuth.password,
    },
    authMethod: "Basic",
    defaultAccountType: "caldav",
  });
  return client;
}

async function getFileContents(config, url) {
  const timeout = config.requestTimeout || 30000;
  client = await loginClient(config);

  // Fetch calendars with timeout
  const calendars = await Promise.race([
    client.fetchCalendars(),
    createTimeoutPromise(timeout, "Fetch calendars"),
  ]);

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

  let objects = null;
  const urlO = [];
  urlO[0] = url;

  for (const calendar of calendars) {
    objects = await Promise.race([
      client.fetchCalendarObjects({
        calendar,
        objectUrls: urlO,
        filters,
      }),
      createTimeoutPromise(timeout, "Fetch calendar objects"),
    ]);
  }
  return objects[0];
}

async function putFileContents(config, url, data) {
  client = await loginClient(config);
  try {
    // try to find the calendar that owns this object URL
    const calendars = await client.fetchCalendars();
    const calendar = calendars.find(
      (c) => url.startsWith(c.url) || c.url.startsWith(url),
    );

    if (!calendar) {
      // fallback: call update without calendar (let library try)
      const resultFallback = await client.updateCalendarObject({
        calendarObject: {
          url,
          data,
        },
      });
      return resultFallback;
    }

    const result = await client.updateCalendarObject({
      calendar,
      calendarObject: {
        url,
        data,
      },
    });
    return result;
  } catch (err) {
    console.error("putFileContents error:", err);
    throw err;
  }
}

function parseList(icsStrings, dateFormat) {
  const elements = [];

  for (const { filename, icsStr } of icsStrings) {
    const icsObj = ical.sync.parseICS(icsStr);
    Object.values(icsObj).forEach((element) => {
      if (element.type === "VTODO") {
        element.filename = filename; // Add filename to the element
        if (element.due) {
          element.dueFormatted = moment(element.due.val).format(dateFormat);
        }
        elements.push(element);
      }
    });
  }

  return elements;
}

function mapEmptyPriorityTo(parsedList, mapEmptyPriorityTo) {
  for (const element of parsedList) {
    if (
      !Object.prototype.hasOwnProperty.call(element, "priority") ||
      element.priority === null ||
      element.priority === "0"
    ) {
      element.priority = mapEmptyPriorityTo.toString();
    }
  }
  return parsedList;
}

function mapEmptySortIndexTo(parsedList, mapEmptySortIndexTo) {
  for (const element of parsedList) {
    if (
      !Object.prototype.hasOwnProperty.call(element, "APPLE-SORT-ORDER") ||
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
      obj.displayName.toLowerCase().includes(matchString.toLowerCase()),
    ),
  );
}

async function fetchCalendarData(config) {
  const timeout = config.requestTimeout || 30000;
  client = await loginClient(config);

  // Fetch calendars with timeout
  let calendars = await Promise.race([
    client.fetchCalendars(),
    createTimeoutPromise(timeout, "Fetch calendars"),
  ]);
  calendars = calendars.filter((calendar) =>
    calendar.components.includes("VTODO"),
  );

  // filter NextCloud Decks, as they are read-only
  calendars = calendars.filter(
    (calendar) => !calendar.url.includes("app-generated--deck"),
  );

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
    const objects = await Promise.race([
      client.fetchCalendarObjects({
        calendar,
        filters,
      }),
      createTimeoutPromise(
        timeout,
        `Fetch objects from ${calendar.displayName || "calendar"}`,
      ),
    ]);

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
  getFileContents,
  putFileContents,
};
