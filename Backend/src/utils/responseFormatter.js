/**
 * Uniform JSON response helpers.
 * All responses follow: { success, message, data? }
 */

const success = (res, data, message = 'Success', statusCode = 200) =>
  res.status(statusCode).json({ success: true, message, data });

const created = (res, data, message = 'Created successfully') =>
  success(res, data, message, 201);

const fail = (res, message = 'An error occurred', statusCode = 500) =>
  res.status(statusCode).json({ success: false, message });

const notFound = (res, message = 'Resource not found') =>
  fail(res, message, 404);

const badRequest = (res, message) =>
  fail(res, message, 400);

const conflict = (res, message) =>
  fail(res, message, 409);

const unauthorized = (res, message = 'Unauthorized') =>
  fail(res, message, 401);

const forbidden = (res, message = 'Forbidden') =>
  fail(res, message, 403);

module.exports = { success, created, fail, notFound, badRequest, conflict, unauthorized, forbidden };
