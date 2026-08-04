const asyncHandler = require('../utils/asyncHandler');
const { success, created, badRequest } = require('../utils/responseFormatter');
const DrawingRequest = require('../models/DrawingRequest');
const Project = require('../models/Project');

// POST /api/drawing-requests — authenticated only (raised from the Daily
// Progress Report page; there's no requester identity to route this to from
// the public no-login form, so that page never renders the button).
exports.createRequest = asyncHandler(async (req, res) => {
  const { projectId, description, priority } = req.body;
  if (!projectId) return badRequest(res, 'Project is required');
  if (!description || !description.trim()) return badRequest(res, 'Describe what drawing is needed');

  const project = await Project.findById(projectId).select('name');
  if (!project) return badRequest(res, 'Project not found');

  const request = await DrawingRequest.create({
    projectId,
    projectName: project.name,
    description: description.trim(),
    priority: priority === 'urgent' ? 'urgent' : 'normal',
    requestedBy: req.user._id,
  });

  created(res, { request }, 'Drawing request submitted');
});

// GET /api/drawing-requests
exports.listRequests = asyncHandler(async (req, res) => {
  const { projectId, status } = req.query;
  const filter = {};
  if (projectId) filter.projectId = projectId;
  if (status) filter.status = status;

  const requests = await DrawingRequest.find(filter)
    .populate('requestedBy', 'name email')
    .sort({ createdAt: -1 })
    .limit(200)
    .lean();

  success(res, { requests });
});
