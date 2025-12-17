const { DAVClient } = require("tsdav");
const ical = require("node-ical");
const moment = require("moment");

let client;

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
  client = initDAVClient(config);
  await client.login();
  const calendars = await client.fetchCalendars();

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
    objects = await client.fetchCalendarObjects({
      calendar,
      objectUrls: urlO,
      filters,
    });
  }
  return objects[0];
}

async function putFileContents(config, url, data) {
  client = initDAVClient(config);
  await client.login();
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
  client = initDAVClient(config);
  await client.login();

  let calendars = await client.fetchCalendars();
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
    const objects = await client.fetchCalendarObjects({
      calendar,
      filters,
    });

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
