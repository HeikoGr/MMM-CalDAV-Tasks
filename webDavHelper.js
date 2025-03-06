/* eslint-disable indent */
const { DAVClient } = require("tsdav");
const ical = require('node-ical');
const moment = require('moment');
const transformer = require("./transformer");

let client;

function initDAVClient(config) {
    client = new DAVClient({
        serverUrl: config.webDavAuth.url,
        credentials: {
            username: config.webDavAuth.username,
            password: config.webDavAuth.password,
        },
        authMethod: 'Basic',
        defaultAccountType: 'caldav',
    });
    return client;
}

async function getFileContentsNew(config, url) {
    client = initDAVClient(config);
    await client.login();
    const calendars = await client.fetchCalendars();

    const filters = [
        {
            'comp-filter': {
                _attributes: { name: 'VCALENDAR' },
                'comp-filter': {
                    _attributes: { name: 'VTODO' },
                },
            },
        },
    ];

    let objects = null;
    let urlO = [];
    urlO[0] = url;

    for (const calendar of calendars) {
        objects = await client.fetchCalendarObjects({
            calendar,
            objectUrls: urlO,
            filters: filters,
        });
    }

    return objects[0];
}

async function putFileContentsNew(config, url, data) {

    client = initDAVClient(config);
    await client.login();
    const result = client.updateCalendarObject({
        calendarObject: {
            url: url,
            data: data
        }
    });
    return result;
}

function parseList(icsStrings, dateFormat) {
    let elements = [];
    for (const { filename, icsStr } of icsStrings) {
        const icsObj = ical.sync.parseICS(icsStr);
        Object.values(icsObj).forEach(element => {
            if (element.type === 'VTODO') {
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
    for (let element of parsedList) {
        if (!element.hasOwnProperty('priority') || element.priority === null || element.priority === "0") { // VTODO uses strings!
            // console.log(`[MMM-CalDAV-Tasks] setting prio for element ${element.filename} to ${mapEmptyPriorityTo}`);
            element.priority = mapEmptyPriorityTo.toString();
        }
    }
    return parsedList;
}

function mapEmptySortIndexTo(parsedList, mapEmptySortIndexTo) {
    for (let element of parsedList) {
        if (!element.hasOwnProperty('APPLE-SORT-ORDER') || element['APPLE-SORT-ORDER'] === null || element['APPLE-SORT-ORDER'] === "0") { // VTODO uses strings!
            // console.log(`[MMM-CalDAV-Tasks] setting prio for element ${element.filename} to ${mapEmptyPriorityTo}`);
            element['APPLE-SORT-ORDER'] = mapEmptySortIndexTo.toString();
        }
    }
    return parsedList;
}

async function fetchCalendarData(config) {
    client = initDAVClient(config);
    await client.login();
    const calendars = await client.fetchCalendars();

    const vtodoCalendars = calendars.filter(calendar =>
        calendar.components.includes('VTODO')
    );

    let calendarData = [];

    const filters = [
        {
            'comp-filter': {
                _attributes: { name: 'VCALENDAR' },
                'comp-filter': {
                    _attributes: { name: 'VTODO' },
                },
            },
        },
    ];

    for (const calendar of vtodoCalendars) {
        const objects = await client.fetchCalendarObjects({
            calendar,
            filters: filters,
        });

        let icsStrings = [];
        for (const object of objects) {
            icsStrings.push({ filename: object.url, icsStr: object.data });
        }

        calendarData.push({
            url: calendar.url,
            calendarColor: calendar.calendarColor,
            summary: calendar.displayName,
            description: calendar.description,
            icsStrings: icsStrings
        });
    }

    return calendarData;
}

module.exports = {
    parseList: parseList,
    fetchCalendarData: fetchCalendarData,
    mapEmptyPriorityTo: mapEmptyPriorityTo,
    mapEmptySortIndexTo: mapEmptySortIndexTo,
    initDAVClient: initDAVClient,
    getFileContentsNew: getFileContentsNew,
    putFileContentsNew: putFileContentsNew
};
