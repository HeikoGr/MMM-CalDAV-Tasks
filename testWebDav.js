const { transformData } = require("./transformer");
const { fetchList, parseList } = require("./webDavHelper");
let config;
let icsList;
try {
  // Optional test config/data; ignore if missing
  // eslint-disable-next-line n/no-missing-require
  config = require("./testConfig");
  // eslint-disable-next-line n/no-missing-require
  icsList = require("./testData");
} catch {
  config = {};
  icsList = [];
}

async function test(command = "local") {
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
