function sortPriority(a, b) {
  return parseInt(a.priority, 10) - parseInt(b.priority, 10);
}

function sortPriorityDesc(a, b) {
  return parseInt(b.priority, 10) - parseInt(a.priority, 10);
}

function sortCreated(a, b) {
  return new Date(a.created).getTime() - new Date(b.created).getTime();
}

function sortCreatedDesc(a, b) {
  return new Date(b.created).getTime() - new Date(a.created).getTime();
}

function sortModified(a, b) {
  return new Date(a.lastmodified).getTime() - new Date(b.lastmodified).getTime();
}

function sortModifiedDesc(a, b) {
  return new Date(b.lastmodified).getTime() - new Date(a.lastmodified).getTime();
}

function sortApple(a, b) {
  return parseInt(a["APPLE-SORT-ORDER"], 10) - parseInt(b["APPLE-SORT-ORDER"], 10);
}

module.exports = {
  sortPriority,
  sortPriorityDesc,
  sortCreated,
  sortCreatedDesc,
  sortModified,
  sortModifiedDesc,
  sortApple,
};
