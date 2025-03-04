/* eslint-disable indent */
const { DAVClient } = require("tsdav");
const  ical  = require('node-ical');
const  moment  = require('moment');
const  transformer  = require("./transformer");

// TODO: this support a single instance of NexCloud as there is just one webDavAuth, however multiple urls are supported
function initWebDav(config) {
    return client = createClient(config.listUrl, config.webDavAuth);
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
    let configWithSingleUrl = { ...config, listUrl: config.listUrl[0] };
    const client = new DAVClient({
        serverUrl: configWithSingleUrl.listUrl,
        credentials: {
            username: configWithSingleUrl.webDavAuth.username,
            password: configWithSingleUrl.webDavAuth.password,
        },
        authMethod: 'Basic',
        defaultAccountType: 'caldav',
    });

    await client.login();
    const calendars = await client.fetchCalendars();
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

    for (const calendar of calendars) {
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
    initWebDav: initWebDav,
};