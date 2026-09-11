const asyncHandler = require('../utils/asyncHandler');
const { success, notFound, badRequest } = require('../utils/responseFormatter');
const Notification = require('../models/Notification');
const User = require('../models/User');

// GET /api/notifications?category=&read=&page=&limit=
// Every query is scoped to req.user._id — there is no way to pass another
// user's id in and get their rows back; this is the entire access control
// for "a user must never see another user's notifications."
exports.listNotifications = asyncHandler(async (req, res) => {
  const { category, read, page = 1, limit = 20 } = req.query;
  const filter = { userId: req.user._id };
  if (category) filter.category = category;
  if (read === 'true') filter.read = true;
  if (read === 'false') filter.read = false;

  const pageNum = Math.max(1, Number(page) || 1);
  const limitNum = Math.min(100, Math.max(1, Number(limit) || 20));

  const [notifications, total] = await Promise.all([
    Notification.find(filter).sort({ createdAt: -1 }).skip((pageNum - 1) * limitNum).limit(limitNum).lean(),
    Notification.countDocuments(filter),
  ]);

  success(res, { notifications, total, page: pageNum, limit: limitNum });
});

// GET /api/notifications/unread-count
exports.unreadCount = asyncHandler(async (req, res) => {
  const count = await Notification.countDocuments({ userId: req.user._id, read: false });
  success(res, { count });
});

// PATCH /api/notifications/:id/read
exports.markRead = asyncHandler(async (req, res) => {
  const notification = await Notification.findOne({ _id: req.params.id, userId: req.user._id });
  if (!notification) return notFound(res, 'Notification not found');
  notification.read = true;
  notification.readAt = new Date();
  await notification.save();
  success(res, { notification });
});

// PATCH /api/notifications/mark-all-read
exports.markAllRead = asyncHandler(async (req, res) => {
  await Notification.updateMany(
    { userId: req.user._id, read: false },
    { $set: { read: true, readAt: new Date() } }
  );
  success(res, {}, 'All notifications marked as read');
});

// GET /api/notifications/preferences
exports.getPreferences = asyncHandler(async (req, res) => {
  success(res, { preferences: req.user.notificationPreferences || { email: false } });
});

// PATCH /api/notifications/preferences
exports.updatePreferences = asyncHandler(async (req, res) => {
  const { email } = req.body;
  if (email !== undefined && typeof email !== 'boolean') return badRequest(res, 'email must be a boolean');
  const user = await User.findById(req.user._id);
  user.notificationPreferences = { ...(user.notificationPreferences || {}), ...(email !== undefined ? { email } : {}) };
  await user.save();
  success(res, { preferences: user.notificationPreferences });
});
