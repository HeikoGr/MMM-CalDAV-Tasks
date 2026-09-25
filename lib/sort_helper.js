function sortPriority(a, b) {
  return parseInt(a.priority, 10) - parseInt(b.priority, 10);
}

function sortPriorityDesc(a, b) {
  return parseInt(b.priority, 10) - parseInt(a.priority, 10);
}

/**
 * Compare two date fields. A task without the field sorts last in either direction: a
 * comparator returning NaN (new Date(undefined)) breaks Array.prototype.sort for the whole list.
 */
function compareDates(left, right, descending) {
  const a = new Date(left).getTime();
  const b = new Date(right).getTime();
  const aMissing = Number.isNaN(a);
  const bMissing = Number.isNaN(b);
  if (aMissing || bMissing) {
    return aMissing === bMissing ? 0 : aMissing ? 1 : -1;
  }
  return descending ? b - a : a - b;
}

function sortCreated(a, b) {
  return compareDates(a.created, b.created, false);
}

function sortCreatedDesc(a, b) {
  return compareDates(a.created, b.created, true);
}

function sortModified(a, b) {
  return compareDates(a.lastmodified, b.lastmodified, false);
}

function sortModifiedDesc(a, b) {
  return compareDates(a.lastmodified, b.lastmodified, true);
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
