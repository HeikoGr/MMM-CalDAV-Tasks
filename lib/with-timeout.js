/**
 * Race a request against a timeout. The timer is cleared as soon as the race
 * is decided, so a finished request leaves nothing pending behind. Passed as a
 * function, the request gets an AbortSignal that fires on timeout, so the
 * losing HTTP request is cancelled instead of running on in the background.
 * The timeout error carries code "ETIMEDOUT" and is also the signal's abort reason.
 * @param {Promise|function(AbortSignal): Promise} request - The request, or a function starting it.
 * @param {number} timeout - Timeout in milliseconds.
 * @param {string} operation - Label for the error message.
 * @returns {Promise} The request's result.
 */
async function withTimeout(request, timeout, operation) {
  const controller = new AbortController();
  const promise = typeof request === "function" ? request(controller.signal) : request;
  let timer = null;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          const error = Object.assign(new Error(`${operation} timed out after ${timeout}ms`), { code: "ETIMEDOUT" });
          reject(error);
          controller.abort(error);
        }, timeout);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { withTimeout };
