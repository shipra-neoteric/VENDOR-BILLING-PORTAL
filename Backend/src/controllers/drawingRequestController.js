const asyncHandler = require('../utils/asyncHandler');
const { success, created, notFound, badRequest } = require('../utils/responseFormatter');
const DrawingRequest = require('../models/DrawingRequest');
const Project = require('../models/Project');
const { nextDrawingRequestTicketNo } = require('../utils/codeGen');

const DRAWING_TYPES = ['Architectural', 'Structural', 'MEP', 'Civil', 'Interior', 'Landscape', 'Shop Drawing', 'As-Built', 'Other'];

async function buildRequestDoc(body) {
  const { projectId, description, drawingType, source, driName } = body;
  if (!projectId) return { error: 'Project is required' };
  if (!description || !description.trim()) return { error: 'Describe what drawing is needed' };
  if (!DRAWING_TYPES.includes(drawingType)) return { error: 'Select a valid drawing type' };
  if (!driName || !driName.trim()) return { error: 'Requested By (DRI) is required' };

  const project = await Project.findById(projectId).select('name');
  if (!project) return { error: 'Project not found' };

  return {
    doc: {
      projectId,
      projectName: project.name,
      description: description.trim(),
      drawingType,
      source: source || '',
      driName: driName.trim(),
    },
  };
}

// POST /api/drawing-requests — authenticated (Daily Progress Report page's button)
exports.createRequest = asyncHandler(async (req, res) => {
  const { doc, error } = await buildRequestDoc(req.body);
  if (error) return badRequest(res, error);

  const request = await DrawingRequest.create({
    ...doc,
    ticketNo: await nextDrawingRequestTicketNo(),
    submittedBy: req.user._id,
    isPublicSubmission: false,
  });

  created(res, { request }, 'Drawing request submitted');
});

// POST /api/public/drawing-requests — no auth
exports.createPublicRequest = asyncHandler(async (req, res) => {
  const { doc, error } = await buildRequestDoc(req.body);
  if (error) return badRequest(res, error);

  const request = await DrawingRequest.create({
    ...doc,
    ticketNo: await nextDrawingRequestTicketNo(),
    submittedBy: null,
    isPublicSubmission: true,
  });

  created(res, { request }, 'Drawing request submitted');
});

// GET /api/drawing-requests?projectId=&status=&priority=&drawingType=&search=&dateFrom=&dateTo=
exports.listRequests = asyncHandler(async (req, res) => {
  const { projectId, status, priority, drawingType, search, dateFrom, dateTo } = req.query;
  const filter = {};
  if (projectId)   filter.projectId = projectId;
  if (status)      filter.status = status;
  if (priority)    filter.priority = priority;
  if (drawingType) filter.drawingType = drawingType;
  if (dateFrom || dateTo) {
    filter.createdAt = {};
    if (dateFrom) filter.createdAt.$gte = new Date(dateFrom + 'T00:00:00.000Z');
    if (dateTo)   filter.createdAt.$lte = new Date(dateTo + 'T23:59:59.999Z');
  }
  if (search) {
    filter.$or = [
      { ticketNo:    { $regex: search, $options: 'i' } },
      { projectName: { $regex: search, $options: 'i' } },
      { description: { $regex: search, $options: 'i' } },
      { driName:     { $regex: search, $options: 'i' } },
    ];
  }

  const requests = await DrawingRequest.find(filter)
    .populate('assignedTo', 'name email')
    .populate('submittedBy', 'name email')
    .sort({ createdAt: -1 })
    .limit(200)
    .lean();

  success(res, { requests, total: requests.length });
});

// GET /api/drawing-requests/:id
exports.getRequest = asyncHandler(async (req, res) => {
  const request = await DrawingRequest.findById(req.params.id)
    .populate('assignedTo', 'name email')
    .populate('submittedBy', 'name email')
    .lean();
  if (!request) return notFound(res, 'Drawing request not found');
  success(res, { request });
});

const UPDATABLE_FIELDS = [
  'assignedTo', 'committedDate', 'priority', 'status', 'actualCompletionDate',
  'planningVerified', 'projectAcknowledged', 'remarks',
];

// PUT /api/drawing-requests/:id — the AGM Response / GM Priority / Planning
// Status / Verification sections of the edit modal; request-info fields
// (project, description, type, source, DRI) are set once at creation and not
// editable here.
exports.updateRequest = asyncHandler(async (req, res) => {
  const request = await DrawingRequest.findById(req.params.id);
  if (!request) return notFound(res, 'Drawing request not found');

  for (const field of UPDATABLE_FIELDS) {
    if (!(field in req.body)) continue;
    const val = req.body[field];
    if (field === 'committedDate' || field === 'actualCompletionDate' || field === 'assignedTo') {
      request[field] = val || null;
    } else if (field === 'planningVerified' || field === 'projectAcknowledged') {
      request[field] = !!val;
    } else {
      request[field] = val;
    }
  }
  await request.save();

  const populated = await DrawingRequest.findById(request._id)
    .populate('assignedTo', 'name email')
    .populate('submittedBy', 'name email')
    .lean();

  success(res, { request: populated }, 'Drawing request updated');
});

// DELETE /api/drawing-requests/:id
exports.deleteRequest = asyncHandler(async (req, res) => {
  const request = await DrawingRequest.findByIdAndDelete(req.params.id);
  if (!request) return notFound(res, 'Drawing request not found');
  success(res, {}, 'Drawing request deleted');
});
