const asyncHandler = require('../utils/asyncHandler');
const { success, created, notFound, badRequest } = require('../utils/responseFormatter');
const DrawingRequest = require('../models/DrawingRequest');
const Project = require('../models/Project');
const { nextDrawingRequestTicketNo } = require('../utils/codeGen');
const { logAudit } = require('../utils/auditLog');

async function populatedRequest(id) {
  return DrawingRequest.findById(id)
    .populate('assignedTo', 'name email')
    .populate('submittedBy', 'name email')
    .populate('reviewHistory.by', 'name')
    .lean();
}

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

// GET /api/drawing-requests?projectId=&status=&reviewStatus=&priority=&drawingType=&search=&dateFrom=&dateTo=
// site-dri sees only requests they submitted themselves; every other role sees all.
exports.listRequests = asyncHandler(async (req, res) => {
  const { projectId, status, reviewStatus, priority, drawingType, search, dateFrom, dateTo } = req.query;
  const filter = {};
  if (req.user.role === 'site-dri') filter.submittedBy = req.user._id;
  if (projectId)    filter.projectId = projectId;
  if (status)       filter.status = status;
  if (reviewStatus) filter.reviewStatus = reviewStatus;
  if (priority)     filter.priority = priority;
  if (drawingType)  filter.drawingType = drawingType;
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
  const request = await populatedRequest(req.params.id);
  if (!request) return notFound(res, 'Drawing request not found');
  if (req.user.role === 'site-dri' && String(request.submittedBy?._id || request.submittedBy) !== String(req.user._id)) {
    return notFound(res, 'Drawing request not found');
  }
  success(res, { request });
});

// AGM/L1 Response / GM/L4 Priority / Planning Status / Verification — these
// are exactly what the dedicated l1/l2/l3/l4-review endpoints below decide.
// Letting them through this generic PUT regardless of reviewStatus would
// make the whole review gate optional: anyone with an edit grant could set
// `status: 'completed'` and `planningVerified: true` on a request AGM/GM
// haven't even looked at yet. Only usable once the chain has actually
// cleared — for post-approval corrections, not as a side door around review.
const WORKFLOW_FIELDS = [
  'assignedTo', 'committedDate', 'priority', 'status', 'actualCompletionDate',
  'planningVerified', 'projectAcknowledged',
];
const UPDATABLE_FIELDS = [...WORKFLOW_FIELDS, 'remarks'];

// PUT /api/drawing-requests/:id — the AGM Response / GM Priority / Planning
// Status / Verification sections of the edit modal; request-info fields
// (project, description, type, source, DRI) are set once at creation and not
// editable here.
exports.updateRequest = asyncHandler(async (req, res) => {
  const request = await DrawingRequest.findById(req.params.id);
  if (!request) return notFound(res, 'Drawing request not found');

  const touchesWorkflowField = WORKFLOW_FIELDS.some((f) => f in req.body);
  if (touchesWorkflowField && request.reviewStatus !== 'approved') {
    return badRequest(res, 'This request must clear AGM and GM review first — use the Review Workflow actions, not a direct edit, to move it forward.');
  }

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

  success(res, { request: await populatedRequest(request._id) }, 'Drawing request updated');
});

// ── Review chain — L1/L3/L4 (GM) + L2 (Architect) ───────────────────────────
// L1 — screens whether the drawing is even needed. Approve forwards to L2
// (optionally assigning who'll draw it + a committed date); return sends it
// all the way back to the DRI (this is the "should this be made at all" gate).
exports.l1Review = asyncHandler(async (req, res) => {
  const { action, assignedTo, committedDate, remarks } = req.body;
  if (!['approve', 'return'].includes(action)) return badRequest(res, "action must be 'approve' or 'return'");

  const request = await DrawingRequest.findById(req.params.id);
  if (!request) return notFound(res, 'Drawing request not found');
  if (request.reviewStatus !== 'l1-gm') {
    return badRequest(res, `Cannot L1-review a request with review status '${request.reviewStatus}'`);
  }

  if (action === 'return') {
    if (!remarks || !remarks.trim()) return badRequest(res, 'A reason is required to return a drawing request');
    request.reviewStatus = 'returned';
    request.reviewHistory.push({ stage: 'l1-gm', action: 'returned', by: req.user._id, remarks: remarks.trim() });
  } else {
    if (assignedTo !== undefined) request.assignedTo = assignedTo || null;
    if (committedDate !== undefined) request.committedDate = committedDate || null;
    request.reviewStatus = 'l2-architect';
    request.reviewHistory.push({ stage: 'l1-gm', action: 'forwarded', by: req.user._id, remarks: (remarks || '').trim() });
  }
  await request.save();

  await logAudit({
    action: action === 'approve' ? 'APPROVE' : 'REJECT', module: 'drawing-requests', user: req.user,
    description: `L1 ${action === 'approve' ? 'approved' : 'returned'} drawing request ${request.ticketNo}`,
    entityType: 'DrawingRequest', entityId: request._id, entityLabel: request.ticketNo,
  });

  success(res, { request: await populatedRequest(request._id) }, action === 'approve' ? 'Forwarded to Architect' : 'Returned to DRI');
});

// L2 — the Architect produces the drawing(s) and submits them. No reject path
// here — the architect produces; only a GM (L3/L4) sends work back.
exports.l2Drawing = asyncHandler(async (req, res) => {
  const { drawingFiles } = req.body;
  if (!Array.isArray(drawingFiles) || drawingFiles.length === 0) {
    return badRequest(res, 'Attach at least one drawing file');
  }
  if (drawingFiles.some((f) => !f || !f.url)) {
    return badRequest(res, 'Every attached file needs a URL');
  }

  const request = await DrawingRequest.findById(req.params.id);
  if (!request) return notFound(res, 'Drawing request not found');
  if (request.reviewStatus !== 'l2-architect') {
    return badRequest(res, `Cannot submit a drawing for a request with review status '${request.reviewStatus}'`);
  }

  request.drawingFiles = drawingFiles.map((f) => ({ name: f.name || '', url: f.url }));
  request.reviewStatus = 'l3-gm';
  request.reviewHistory.push({ stage: 'l2-architect', action: 'submitted', by: req.user._id, remarks: '' });
  await request.save();

  await logAudit({
    action: 'UPDATE', module: 'drawing-requests', user: req.user,
    description: `Drawing submitted for drawing request ${request.ticketNo}`,
    entityType: 'DrawingRequest', entityId: request._id, entityLabel: request.ticketNo,
  });

  success(res, { request: await populatedRequest(request._id) }, 'Drawing submitted for GM cross-check');
});

// L3 — a GM cross-checks the uploaded drawing. Approve forwards to L4;
// return sends it back to L2 — the drawing needs rework, not the request.
exports.l3Review = asyncHandler(async (req, res) => {
  const { action, remarks } = req.body;
  if (!['approve', 'return'].includes(action)) return badRequest(res, "action must be 'approve' or 'return'");

  const request = await DrawingRequest.findById(req.params.id);
  if (!request) return notFound(res, 'Drawing request not found');
  if (request.reviewStatus !== 'l3-gm') {
    return badRequest(res, `Cannot L3-review a request with review status '${request.reviewStatus}'`);
  }

  if (action === 'return') {
    if (!remarks || !remarks.trim()) return badRequest(res, 'A reason is required to send a drawing back for rework');
    request.reviewStatus = 'l2-architect';
    request.reviewHistory.push({ stage: 'l3-gm', action: 'returned', by: req.user._id, remarks: remarks.trim() });
  } else {
    request.reviewStatus = 'l4-gm';
    request.reviewHistory.push({ stage: 'l3-gm', action: 'forwarded', by: req.user._id, remarks: (remarks || '').trim() });
  }
  await request.save();

  await logAudit({
    action: action === 'approve' ? 'APPROVE' : 'REJECT', module: 'drawing-requests', user: req.user,
    description: `L3 ${action === 'approve' ? 'approved' : 'sent back for rework'} drawing request ${request.ticketNo}`,
    entityType: 'DrawingRequest', entityId: request._id, entityLabel: request.ticketNo,
  });

  success(res, { request: await populatedRequest(request._id) }, action === 'approve' ? 'Forwarded to final approval' : 'Sent back to Architect for rework');
});

// L4 — final approval by a different GM. Approve is terminal — ready for
// physical dispatch to the site engineer; Planning then takes over via the
// existing status/verification fields on this same doc. Return sends it
// back to L2, same as an L3 rejection.
exports.l4Review = asyncHandler(async (req, res) => {
  const { action, priority, remarks } = req.body;
  if (!['approve', 'return'].includes(action)) return badRequest(res, "action must be 'approve' or 'return'");

  const request = await DrawingRequest.findById(req.params.id);
  if (!request) return notFound(res, 'Drawing request not found');
  if (request.reviewStatus !== 'l4-gm') {
    return badRequest(res, `Cannot L4-review a request with review status '${request.reviewStatus}'`);
  }

  if (action === 'return') {
    if (!remarks || !remarks.trim()) return badRequest(res, 'A reason is required to send a drawing back for rework');
    request.reviewStatus = 'l2-architect';
    request.reviewHistory.push({ stage: 'l4-gm', action: 'returned', by: req.user._id, remarks: remarks.trim() });
  } else {
    if (priority) request.priority = priority;
    request.reviewStatus = 'approved';
    request.reviewHistory.push({ stage: 'l4-gm', action: 'approved', by: req.user._id, remarks: (remarks || '').trim() });
  }
  await request.save();

  await logAudit({
    action: action === 'approve' ? 'APPROVE' : 'REJECT', module: 'drawing-requests', user: req.user,
    description: `L4 ${action === 'approve' ? 'approved' : 'sent back for rework'} drawing request ${request.ticketNo}`,
    entityType: 'DrawingRequest', entityId: request._id, entityLabel: request.ticketNo,
  });

  success(res, { request: await populatedRequest(request._id) }, action === 'approve' ? 'Approved' : 'Sent back to Architect for rework');
});

// Returned (from L1) always goes back to L1, never straight past it — same
// "always to L1" segregation the Work Order approval chain uses.
exports.resubmitRequest = asyncHandler(async (req, res) => {
  const request = await DrawingRequest.findById(req.params.id);
  if (!request) return notFound(res, 'Drawing request not found');
  if (request.reviewStatus !== 'returned') {
    return badRequest(res, `Cannot resubmit a request with review status '${request.reviewStatus}'`);
  }
  request.reviewStatus = 'l1-gm';
  request.reviewHistory.push({ stage: 'dri', action: 'resubmitted', by: req.user._id, remarks: (req.body.remarks || '').trim() });
  await request.save();

  await logAudit({
    action: 'UPDATE', module: 'drawing-requests', user: req.user,
    description: `Resubmitted drawing request ${request.ticketNo} for L1 review`,
    entityType: 'DrawingRequest', entityId: request._id, entityLabel: request.ticketNo,
  });

  success(res, { request: await populatedRequest(request._id) }, 'Resubmitted for review');
});

// DELETE /api/drawing-requests/:id
exports.deleteRequest = asyncHandler(async (req, res) => {
  const request = await DrawingRequest.findByIdAndDelete(req.params.id);
  if (!request) return notFound(res, 'Drawing request not found');
  success(res, {}, 'Drawing request deleted');
});
