/*
 * Long press on a task item: fills the progress bar over toggleTime, then
 * flips the item optimistically and reports the state it now shows.
 */
/* global window, module */

/**
 * @param {HTMLElement} item - A .MMM-CalDAV-Tasks-List-Item element
 * @param {Object} options - Options
 * @param {number} options.toggleTime - Press duration in ms
 * @param {boolean} options.hideDateSectionOnCompletion - Mirror of the config option
 * @param {Function} options.onToggle - ({ filename, uid, status }) => void
 */
function bindLongPress(item, options) {
  let pressTimer = null;
  const progress = item.querySelector(".MMM-CalDAV-Tasks-Press-Progress");

  const toggleCheck = () => {
    const iconSpan = item.querySelector(".fa");
    if (!iconSpan) {
      return null;
    }
    const isChecked = iconSpan.classList.contains("fa-check-square");
    iconSpan.classList.toggle("fa-check-square", !isChecked);
    iconSpan.classList.toggle("fa-square", isChecked);
    return isChecked ? "unchecked" : "checked";
  };

  const handleToggle = () => {
    const status = toggleCheck();

    item.classList.add("MMM-CalDAV-Tasks-Toggle-Flash");
    setTimeout(() => {
      item.classList.remove("MMM-CalDAV-Tasks-Toggle-Flash");
    }, 300);

    item.classList.toggle("MMM-CalDAV-Tasks-Completed");

    // The item holds only its own date section; nested tasks keep theirs.
    const dateSection = item.querySelector(".MMM-CalDAV-Tasks-Date-Section");
    if (dateSection) {
      if (options.hideDateSectionOnCompletion) {
        dateSection.style.display = dateSection.style.display === "none" ? "" : "none";
      } else {
        dateSection.classList.toggle("MMM-CalDAV-Tasks-Completed");
      }
    }

    options.onToggle({
      filename: item.dataset.vtodoFilename,
      uid: item.dataset.uid,
      status,
    });
  };

  const cancelPress = () => {
    if (pressTimer) {
      clearTimeout(pressTimer);
      pressTimer = null;
    }
    item.classList.remove("MMM-CalDAV-Tasks-Pressing");
    progress.style.transition = "none";
    progress.style.transform = "scaleX(0)";
  };

  const startPress = () => {
    cancelPress();
    item.classList.add("MMM-CalDAV-Tasks-Pressing");

    // Restart the fill from zero; reading offsetWidth applies the reset
    // before the new transition starts.
    void progress.offsetWidth;
    progress.style.transition = `transform ${options.toggleTime}ms linear`;
    progress.style.transform = "scaleX(1)";

    pressTimer = setTimeout(() => {
      cancelPress();
      handleToggle();
    }, options.toggleTime);
  };

  item.addEventListener("mousedown", startPress);
  item.addEventListener("touchstart", startPress, { passive: true });
  item.addEventListener("mouseup", cancelPress);
  item.addEventListener("mouseleave", cancelPress);
  item.addEventListener("touchend", cancelPress);
  item.addEventListener("touchcancel", cancelPress);
}

if (typeof window !== "undefined") {
  window.CalDavTasksLongPress = { bindLongPress };
}
if (typeof module !== "undefined" && module.exports) {
  module.exports = { bindLongPress };
}
