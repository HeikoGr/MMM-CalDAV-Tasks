
const {AuthType, createClient} = require("webdav");
const ical = require("node-ical");
const {transformData} = require("./transformer");
const {fetchList, parseList} = require("./webDavHelper");
const config = require("./testConfig");
let icsList = require("./testData");

async function test (command = "local") {
  if (command == "fetch") {
    icsList = await fetchList(config);
  }

  console.log("icsList:", icsList);
  const rawList = parseList(icsList);
  console.log("rawList:", rawList);
  const nestedList = transformData(rawList);
  console.log("nestedList:", nestedList);
  console.log(JSON.stringify(nestedList));
}

// test("fetch"); // test by using real list from testConfig.js
test("local"); // test by using local list from testData.js
