/* eslint-disable indent */
const { createClient } = require("webdav");
const ical = require('node-ical');
const moment = require('moment');
const transformer = require("./transformer");

// TODO: this support a single instance of NexCloud as there is just one webDavAuth, however multiple urls are supported
function initWebDav(config) {
    return client = createClient(config.listUrl, config.webDavAuth);
}

function parseList(icsStrings,dateFormat) {
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
            // console.log(`[MMM-Nextcloud-Tasks] setting prio for element ${element.filename} to ${mapEmptyPriorityTo}`);
            element.priority = mapEmptyPriorityTo.toString();
        }
    }
    return parsedList;
}

async function fetchList(config) {
    const client = initWebDav(config);
    const directoryItems = await client.getDirectoryContents("/");
    // console.log("[MMM-Nextcloud-Tasks] fetchList:", directoryItems);

    let icsStrings = [];
    for (const element of directoryItems) {
        let attempt = 0;
        let icsStr;
        while (attempt < 5) {
            try {
                icsStr = await client.getFileContents(element.filename, { format: "text" });
                break;
            } catch (error) {
                console.error(`[MMM-Nextcloud-Tasks] Error fetching file ${element.filename}: ${error.message}. Attempt ${attempt + 1} of 5.`);
                attempt++;
                if (attempt < 3) {
                    await new Promise(resolve => setTimeout(resolve, 8000)); // wait 8 seconds before retrying
                } else {
                    console.error(`[MMM-Nextcloud-Tasks] Failed to fetch file ${element.filename} after 5 attempts.`);
                }
            }
        }
        if (icsStr) {
            icsStrings.push({ filename: element.filename, icsStr });
        }
    }
    return icsStrings;
}

module.exports = {
    parseList: parseList,
    fetchList: fetchList,
    mapEmptyPriorityTo: mapEmptyPriorityTo,
    initWebDav: initWebDav,
};