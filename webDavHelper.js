/* eslint-disable indent */
const { createClient } = require("webdav");
const ical = require('node-ical');
const transformer = require("./transformer");

// TODO: this support a single instance of NexCloud as there is just one webDavAuth, however multiple urls are supported
function initWebDav(config) {
    return client = createClient(config.listUrl, config.webDavAuth);
}

function parseList(icsStrings) {
    let elements = [];
    for (const { filename, icsStr } of icsStrings) {
        const icsObj = ical.sync.parseICS(icsStr);
        Object.values(icsObj).forEach(element => {
            if (element.type === 'VTODO') {
                element.filename = filename; // Add filename to the element
                elements.push(element);
            }
        });
    }
    return elements;
}

function mapEmptyPriorityTo(parsedList, mapEmptyPriorityTo) {
    for (let element of parsedList) {
        if (!element.hasOwnProperty('priority') || element.priority === null || element.priority === "0") { // VTODO uses strings!
            console.log(`[MMM-Nextcloud-Tasks] Setting priority for element with filename ${element.filename} to ${mapEmptyPriorityTo}`);
            element.priority = mapEmptyPriorityTo.toString();
        }
    }
    console.log("[MMM-Nextcloud-Tasks] mapEmptyPriorityTo --> parsed List: ", parsedList);
    return parsedList;
}

async function fetchList(config) {
    const client = initWebDav(config);
    const directoryItems = await client.getDirectoryContents("/");
    console.log("[MMM-Nextcloud-Tasks] fetchList:", directoryItems);

    let icsStrings = [];
    for (const element of directoryItems) {
        let attempt = 0;
        let icsStr;
        while (attempt < 3) {
            try {
                icsStr = await client.getFileContents(element.filename, { format: "text" });
                break;
            } catch (error) {
                console.error(`[MMM-Nextcloud-Tasks] Error fetching file ${element.filename}: ${error.message}. Attempt ${attempt + 1} of 3.`);
                attempt++;
                if (attempt < 3) {
                    await new Promise(resolve => setTimeout(resolve, 20000)); // wait 20 seconds before retrying
                } else {
                    console.error(`[MMM-Nextcloud-Tasks] Failed to fetch file ${element.filename} after 3 attempts.`);
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