/** Wait for a duration in milliseconds. @param {number} ms @returns {Promise<void>} */
export function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
