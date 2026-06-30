/**
 * Wraps an async route handler so errors are forwarded to Express error middleware
 * instead of requiring try/catch in every controller.
 */
const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

module.exports = asyncHandler;
