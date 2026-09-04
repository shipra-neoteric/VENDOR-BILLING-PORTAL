const mongoose    = require('mongoose');
const BillRequest = require('../models/BillRequest');
const WorkOrder   = require('../models/WorkOrder');
const RunningBill = require('../models/RunningBill');
const asyncHandler = require('../utils/asyncHandler');
const { success, created, notFound, badRequest, forbidden } = require('../utils/responseFormatter');
const emitEvent   = require('../utils/emitEvent');
const { startInstance, advanceInstance, cancelInstance } = require('../utils/slaEngine');
const { logAudit } = require('../utils/auditLog');
const { hasUnapprovedVarianceForLineItem, resolveBillableItem, isWorkOrderApproved } = require('../utils/varianceCheck');
const { nextCode } = require('../utils/sequence');
const { nextBillNo } = require('../utils/codeGen');
const { recomputeAfterInvalidate, expandBillableCandidates, recomputeParentFromSubItems } = require('../utils/progressHelpers');
const { resolvePayee } = require('../utils/vendorGroupHelpers');
const { applyAdvanceRecoveries } = require('../utils/advanceRecovery');
const { notifyStagePending, settleAllPendingForEntity } = require('../utils/slackApprovals');
const { canActOnDepartment } = require('../utils/departmentAccess');
const { getApprovalConfig, approverAllowed } = require('../utils/approvalRules');

// Fire-and-forget (matches emitEvent's un-awaited call sites below) — a failed
// or unconfigured Slack push must never block the real approval-chain write
// that already happened.
function notifySlack(approvalType, entityDoc) {
  notifyStagePending(approvalType, entityDoc)
    .catch((err) => console.error(`[slack] ${approvalType} notify failed`, err.message));
}

// Gathers the DRI's day-to-day notes for whichever progress entries on this
// exact billable target (a particular, or a plain scope item with none)
// haven't been carried into a bill yet — marks them as consumed on the way
// out, so they ride along into the BillRequest/RunningBill line item instead
// of staying trapped on the WorkOrder document.
function collectAndMarkProgressRemarks(target, billRequestId) {
  const notes = [];
  const locations = [];
  for (const entry of target.progressEntries) {
    if (entry.billedInRequestId || entry.invalidated?.done) continue;
    // Same "Tower X · Floor Y · ..." format Site Progress's own entry log
    // already shows — kept as its own field (not embedded in the remark
    // text), separate from the work order's own overall projectLocation.
    const location = [
      entry.tower && `Tower ${entry.tower}`,
      entry.floor && `Floor ${entry.floor}`,
      entry.flatNo && `Flat ${entry.flatNo}`,
      entry.plotNo && `Plot ${entry.plotNo}`,
      entry.locationNote,
    ].filter(Boolean).join(" · ");
    if (location && !locations.includes(location)) locations.push(location);
    if (entry.remarks && entry.remarks.trim()) notes.push(entry.remarks.trim());
    entry.billedInRequestId = billRequestId;
  }
  // Newline-separated (not '; ') — several days' worth of separate remarks
  // run together into one unreadable sentence otherwise once they land on a
  // bill; the frontend renders this as a bullet list, one line per entry.
  return { remarks: notes.join('\n'), location: locations.join(' · ') };
}

const nextReqNo = () => nextCode('billRequestReqNo', 'BR-', 4);

// GET /api/bill-requests
exports.listBillRequests = asyncHandler(async (req, res) => {
  const { status, workOrderId, vendorCode, projectId, archived, scope } = req.query;
  const filter = {};

  if (req.user.role === 'site-dri') filter.requestedBy = req.user._id;
  if (status)      filter.status      = status;
  if (workOrderId) filter.workOrderId = workOrderId;
  if (vendorCode)  filter.vendorCode  = vendorCode;
  if (projectId)   filter.projectId   = projectId;
  if (archived === 'true') filter.isArchived = true;
  else if (archived !== 'all') filter.isArchived = { $ne: true };
  // archived === 'all' → no isArchived filter, returns both
  // Department-scoped visibility — but ONLY for the L1/L2 approval queue
  // (Bill Approval's own load, and My Tasks' pending/pending-gm widgets),
  // never for the many other screens (Work Order Dashboard, DRI Dashboard,
  // Site Progress, SLA Dashboard, Projects, Work Progress) that also hit
  // this same endpoint needing every request regardless of department —
  // scope=approval / a pending status is how those two opt in explicitly.
  // Owner and Accounts see everything regardless (Owner by design, Accounts
  // because payment processing runs across every department once a bill
  // clears L1/L2). Users not yet assigned a department (the field is new)
  // see everything too, so rollout doesn't silently empty their queue until
  // an admin assigns one.
  const isApprovalQueue = scope === 'approval' || ['pending', 'pending-gm', 'pending-l3', 'pending-l4'].includes(status);
  if (isApprovalQueue && !['owner', 'accounts'].includes(req.user.role) && req.user.department) {
    // A request with no department of its own (an older work order that
    // predates this field, or a standalone bill nobody classified) belongs
    // to no one yet — it must stay visible to everyone, not just Owner/
    // Accounts, or it becomes stuck and un-actionable in every department's
    // queue. "Custom" also isn't one team — it's an escape hatch for
    // whatever name was typed in, so two different custom departments must
    // never match each other just because both picked "custom" (mirrors
    // canActOnDepartment's own check on the action side).
    filter.$or = [
      { department: { $in: ['', null] } },
      req.user.department === 'custom'
        ? { department: 'custom', customDepartment: req.user.customDepartment || '' }
        : { department: req.user.department },
    ];
  }

  const requests = await BillRequest.find(filter)
    .populate('requestedBy', 'name email')
    .populate('processedBy', 'name role')
    .populate('agmApprovedBy', 'name role')
    .populate('gmApprovedBy', 'name role')
    .populate('l3ApprovedBy', 'name role')
    .populate('l4ApprovedBy', 'name role')
    .populate('sentForL2ApprovalTo', 'name role')
    .populate('approvalHistory.by', 'name role')
    .populate({
      path: 'billId',
      select: 'billNo status amount paidAmount retentionPercent retentionAmount advanceRecovery gstPercent tdsPercent tdsAmount paymentDate paymentMode paymentUTR paymentBank paymentReleasedBy verificationBy verificationAt l1ApprovedBy l1ApprovedAt l2ApprovedBy l2ApprovedAt tmsSentAt tmsCallbackReceivedAt agmApprovedBy agmApprovedAt lineItems',
      populate: [
        { path: 'verificationBy', select: 'name' },
        { path: 'l1ApprovedBy', select: 'name' },
        { path: 'l2ApprovedBy', select: 'name' },
        // Pre-redesign bills (e.g. batch-created ones) never wrote the
        // BillRequest's own agmApprovedBy/approvalHistory — only this
        // RunningBill-level field, set by gmApprove at bill-creation time.
        // BillDetailModal falls back to it when approvalHistory is empty.
        { path: 'agmApprovedBy', select: 'name' },
        // Who signed off the quantity variance snapshotted onto lineItems —
        // see gmApprove above for where this gets copied from the WO.
        { path: 'lineItems.varianceApprovedBy', select: 'name' },
      ],
    })
    .sort({ stageNo: 1, createdAt: 1 });

  success(res, { billRequests: requests });
});

// POST /api/bill-requests  — qty is auto-calculated, only remarks accepted from client
exports.createBillRequest = asyncHandler(async (req, res) => {
  const { workOrderId, remarks, scopeItemIds } = req.body;

  const wo = await WorkOrder.findById(workOrderId);
  if (!wo) return notFound(res, 'Work order not found');

  if (req.user.role === 'site-dri') {
    const isAssigned = (wo.assignedDRI || []).some(
      id => id.toString() === req.user._id.toString()
    );
    if (!isAssigned) return forbidden(res, 'You are not assigned to this work order');
  }

  if (!isWorkOrderApproved(wo)) {
    return badRequest(res, `"${wo.workOrderNo}" has not completed its own approval chain yet (currently ${wo.approvalStatus}) — no bill request can be raised until Final Approval is given.`);
  }

  // Check no request already in flight (either stage) exists
  const existing = await BillRequest.findOne({ workOrderId: wo._id, status: { $in: ['pending', 'pending-gm', 'pending-l3', 'pending-l4'] } });
  if (existing) {
    return badRequest(res, `Stage ${existing.stageNo} (${existing.reqNo}) is already pending approval. Wait for admin review before submitting a new request.`);
  }

  // AGM/GM can hand-pick which completed items go into this cycle (checklist
  // on the Bill Review page); omitting scopeItemIds bills every pending item,
  // preserving Owner's existing one-click bypass behavior.
  const selectedIds = Array.isArray(scopeItemIds) && scopeItemIds.length > 0
    ? new Set(scopeItemIds.map(String))
    : null;

  // Billing operates per particular when an item has them — never against
  // the parent's own rolled-up completedQty, which is a display average, not
  // a billable quantity (see recomputeParentFromSubItems). Rate is
  // snapshotted here too (not just at gmApprove) purely so it's visible to
  // whoever reviews the request at L1/L2 — gmApprove still re-reads the WO's
  // current rate fresh when it actually builds the RunningBill, so a rate
  // edited on the WO in between never goes stale in what's actually billed.
  const pendingItems = expandBillableCandidates(wo.scopeItems, selectedIds)
    .map(c => ({
      ...c,
      billedQty: Math.max(0, c.completedQty - c.lastBilledQty),
    }))
    .filter(it => it.billedQty > 0);

  if (!pendingItems.length) {
    return badRequest(res, 'No new progress to bill. Record daily progress first before generating a bill request.');
  }

  // Any item still over its planned qty (or the specific particular being
  // billed) must be explicitly signed off by AGM/GM before it can go into a bill.
  for (const pi of pendingItems) {
    const si = wo.scopeItems.id(pi.scopeItemId);
    if (hasUnapprovedVarianceForLineItem(si, pi.subItemId)) {
      return badRequest(res, `"${pi.description}" has unapproved progress variance — approve it before billing.`);
    }
  }

  // Stage number and billing period
  const stageNo = await BillRequest.countDocuments({ workOrderId: wo._id }) + 1;
  const lastBR  = await BillRequest.findOne({ workOrderId: wo._id }).sort({ createdAt: -1 }).select('createdAt periodTo');
  const periodFrom = lastBR?.periodTo ?? wo.issueDate ?? new Date();
  const periodTo   = new Date();

  const reqNo = await nextReqNo();
  const billRequestId = new mongoose.Types.ObjectId();

  // Carry each billed item's not-yet-billed progress-entry remarks along, and
  // mark those entries consumed (on the in-memory WO doc — saved below).
  const progressRemarksByItem = new Map();
  for (const pi of pendingItems) {
    const si = wo.scopeItems.id(pi.scopeItemId);
    const target = resolveBillableItem(si, pi.subItemId);
    progressRemarksByItem.set(String(pi.subItemId || pi.scopeItemId), collectAndMarkProgressRemarks(target, billRequestId));
  }

  const billRequest = await BillRequest.create({
    _id: billRequestId,
    reqNo,
    stageNo,
    workOrderId: wo._id,
    workOrderNo: wo.workOrderNo,
    projectId:   wo.projectId || null,
    projectName: wo.projectName,
    projectLocation: wo.projectLocation,
    vendorCode:  wo.vendorCode,
    vendorName:  wo.vendorName,
    companyName: wo.companyName,
    category:    wo.category    || '',
    subCategory: wo.subCategory || '',
    department:       wo.department       || '',
    customDepartment: wo.customDepartment || '',
    periodFrom,
    periodTo,
    items: pendingItems.map(it => ({
      scopeItemId: it.scopeItemId,
      subItemId:   it.subItemId,
      description: it.description,
      unit:        it.unit,
      billedQty:   it.billedQty,
      rate:        it.rate,
      amount:      it.rate * it.billedQty,
      progressRemarks: progressRemarksByItem.get(String(it.subItemId || it.scopeItemId))?.remarks || '',
      location:        progressRemarksByItem.get(String(it.subItemId || it.scopeItemId))?.location || '',
    })),
    remarks:     remarks || '',
    requestedBy: req.user._id,
  });

  // Lock in lastBilledQty on each billed particular (or plain scope item) so
  // it can't be double-billed.
  const touchedParents = new Set();
  for (const pi of pendingItems) {
    const si = wo.scopeItems.id(pi.scopeItemId);
    const target = resolveBillableItem(si, pi.subItemId);
    if (target) target.lastBilledQty = pi.completedQty;
    if (pi.subItemId) touchedParents.add(String(pi.scopeItemId));
  }
  for (const scopeItemId of touchedParents) {
    const si = wo.scopeItems.id(scopeItemId);
    if (si) recomputeParentFromSubItems(si);
  }
  await wo.save();

  emitEvent('BILL_REQUESTED', {
    projectId:     wo.projectId,
    workOrderId:   wo._id,
    workOrderNo:   wo.workOrderNo,
    billRequestId: billRequest._id,
    vendorCode:    wo.vendorCode,
    vendorName:    wo.vendorName,
    stageNo,
    user:          req.user,
    metadata:      { reqNo },
  });

  const estimatedAmount = pendingItems.reduce((s, it) => s + it.billedQty * (it.rate || 0), 0);
  await startInstance('BillRequest', billRequest._id, billRequest.reqNo, req.user._id, {
    projectId: wo.projectId, projectName: wo.projectName, vendorName: wo.vendorName, amount: estimatedAmount,
  });

  await logAudit({
    action: 'CREATE', module: 'bill-requests', user: req.user,
    description: `Bill request ${reqNo} created`,
    entityType: 'BillRequest', entityId: billRequest._id, entityLabel: reqNo,
  });

  notifySlack('BILL_REQUEST_AGM_APPROVAL', billRequest);

  created(res, { billRequest }, `Stage ${stageNo} bill request ${reqNo} submitted successfully`);
});

// PUT /api/bill-requests/:id/agm-approve — Stage 1 (L1). Decides the actual
// hold/advance figures, but doesn't create the RunningBill yet — that only
// happens once GM signs off too (see gmApprove below).
exports.agmApprove = asyncHandler(async (req, res) => {
  const br = await BillRequest.findById(req.params.id);
  if (!br) return notFound(res, 'Bill request not found');
  if (!canActOnDepartment(req.user, br)) return forbidden(res, 'This bill request belongs to a different department.');
  if (br.status !== 'pending') return badRequest(res, `Request is already ${br.status}`);

  // Departments with no Approval Rule configured (Users → Departments) keep
  // today's exact behavior untouched — 2 stages, owner+agm/owner+gm only.
  // A configured department can narrow who approves at this stage, and/or
  // collapse to a single approval (see the requiredApprovals check below).
  const approvalConfig = await getApprovalConfig(br);
  if (!approverAllowed(req.user, approvalConfig, 'agm')) {
    return forbidden(res, "You're not configured as an L1 (AGM) approver for this department.");
  }

  const wo = await WorkOrder.findById(br.workOrderId);
  if (!wo) return notFound(res, 'Associated work order not found');

  const totalAmount = br.items.reduce((s, item) => {
    const scopeItem = item.scopeItemId ? wo.scopeItems.id(item.scopeItemId) : wo.scopeItems.find(si => si.description === item.description);
    const target = resolveBillableItem(scopeItem, item.subItemId);
    return s + (target?.rate ?? 0) * item.billedQty;
  }, 0);
  const retentionPercent = wo.retentionPercent ?? 0;
  // Rounded to paise (2 decimals), not the nearest whole rupee — a fractional
  // rate produces genuinely fractional amounts, and rounding away decimals
  // here would discard real money rather than just formatting it for display.
  const defaultRetention = Math.round(totalAmount * retentionPercent) / 100;
  // AGM sets the actual hold/advance figures as part of L1 approval — falls back
  // to the work order's automatic retention calc if AGM doesn't override it.
  // Persisted here (not just used once) since gmApprove reads them back later.
  const retentionAmount  = req.body.retentionAmount != null ? Number(req.body.retentionAmount) : defaultRetention;
  let advanceRecovery    = req.body.advanceRecovery != null ? Number(req.body.advanceRecovery) : 0;

  // Who this bill should actually pay — normally left unset (gmApprove then
  // defaults to the work order's own vendor); only resolved here when AGM
  // names a fellow Vendor Group member as the payee instead. GM can still
  // change this again at Stage 2 (final say before the bill is generated).
  const payee = await resolvePayee(wo.vendorCode, wo.vendorName, req.body.payeeVendorCode);

  if (req.body.gstPercent != null) {
    const gst = Number(req.body.gstPercent);
    if (Number.isNaN(gst) || gst < 0 || gst > 100) return badRequest(res, 'GST% must be a number between 0 and 100');
    br.gstPercentOverride = gst;
  }

  // Which real AdvanceSlip(s) advanceRecovery is settling — must belong to
  // whoever is ACTUALLY receiving this bill's payment (the resolved payee
  // above, which may be a fellow Vendor Group member, not just the work
  // order's own base vendor) or the recovery makes no sense.
  const advanceRecoveries = Array.isArray(req.body.advanceRecoveries) ? req.body.advanceRecoveries : [];
  if (advanceRecoveries.length) {
    const AdvanceSlip = require('../models/AdvanceSlip');
    const slips = await AdvanceSlip.find({ _id: { $in: advanceRecoveries.map(r => r.slipId).filter(Boolean) } }).select('contractorCode');
    const mismatch = slips.find(s => s.contractorCode !== payee.vendorCode);
    if (mismatch) {
      return badRequest(res, `Advance slip ${mismatch._id} does not belong to this bill's payee (${payee.vendorCode}).`);
    }
    // Keep the flat total consistent with the itemized breakdown, rather than
    // trusting two independently-sent numbers to already agree.
    advanceRecovery = advanceRecoveries.reduce((s, r) => s + (Number(r.amount) || 0), 0);
  }

  br.retentionAmount = retentionAmount;
  br.advanceRecovery = advanceRecovery;
  br.advanceRecoveries = advanceRecoveries;
  br.payeeVendorCode = payee.overridden ? payee.vendorCode : '';
  br.payeeVendorName = payee.overridden ? payee.vendorName : '';
  br.agmApprovedBy   = req.user._id;
  br.agmApprovedAt   = new Date();
  if (req.body.sentForL2ApprovalTo) br.sentForL2ApprovalTo = req.body.sentForL2ApprovalTo;
  br.status          = 'pending-gm';
  br.approvalHistory.push({ stage: 'agm', action: 'approved', by: req.user._id, byName: req.user.name, byRole: req.user.role, remarks: req.body.remarks || '' });
  await br.save();

  emitEvent('BILL_REQUEST_AGM_APPROVED', {
    projectId:     wo.projectId,
    workOrderId:   wo._id,
    workOrderNo:   wo.workOrderNo,
    billRequestId: br._id,
    vendorCode:    wo.vendorCode,
    vendorName:    wo.vendorName,
    stageNo:       br.stageNo,
    user:          req.user,
    metadata:      { reqNo: br.reqNo, totalAmount },
  });

  await advanceInstance('BillRequest', br._id, req.user._id, 'L1 approved');

  await logAudit({
    action: 'APPROVE', module: 'bill-requests', user: req.user,
    description: `L1 approved ${br.reqNo} — moved to L2 approval`,
    entityType: 'BillRequest', entityId: br._id, entityLabel: br.reqNo,
    changes: { retentionAmount: { from: null, to: retentionAmount }, advanceRecovery: { from: null, to: advanceRecovery } },
  });

  // This department is configured for a single approval — AGM's own
  // sign-off just above is already final, so finalize immediately instead
  // of waiting on a separate GM click. Calls finalizeBillRequest directly
  // (not gmApproveHandler) — routing through the GM handler used to also
  // stamp a phantom br.gmApprovedBy/'gm' history entry onto this same AGM's
  // action, which is wrong for a department with no real L2 stage at all.
  if (approvalConfig?.requiredApprovals === 1) {
    const result = await finalizeBillRequest(br, wo, req, res, 'agm');
    if (!result) return;
    return success(res, result, result.message);
  }

  notifySlack('BILL_REQUEST_GM_APPROVAL', br);

  success(res, { billRequest: br }, `L1 approved — Stage ${br.stageNo} moved to L2 approval`);
});

// The actual bill-creation logic — reached from whichever stage handler
// (gm/l3/l4) turns out to be this department's LAST configured level. On
// failure it sends the error response itself and returns null (mirroring
// every other early-return check in this file); on success it returns
// { billRequest, bill, message } WITHOUT sending a response, so each caller
// can shape its own success() call — a caller must check for null.
async function finalizeBillRequest(br, wo, req, res, finalStage) {
  // Re-check at the actual bill-creation moment, not just when the request
  // was first raised — an edit to Scope of Work/Payment Milestones between
  // then and now can reset the WO back into its own approval chain.
  if (!isWorkOrderApproved(wo)) {
    badRequest(res, `"${wo.workOrderNo}" is no longer fully approved (currently ${wo.approvalStatus}) — it must clear its own approval chain again before this request can become a bill.`);
    return null;
  }

  // Final-stage approver has last say on who actually gets paid — can
  // override it with a different fellow Vendor Group member. Only re-resolved
  // when GM explicitly sends a payeeVendorCode; otherwise AGM's choice (or the
  // work order's own vendor, if neither ever set one) stands unchanged.
  if (req.body.payeeVendorCode) {
    const payee = await resolvePayee(wo.vendorCode, wo.vendorName, req.body.payeeVendorCode);
    br.payeeVendorCode = payee.overridden ? payee.vendorCode : '';
    br.payeeVendorName = payee.overridden ? payee.vendorName : '';
  }

  // Build line items with rates from WO
  const lineItems = br.items.map(item => {
    const scopeItem = item.scopeItemId
      ? wo.scopeItems.id(item.scopeItemId)
      : wo.scopeItems.find(si => si.description === item.description);
    const target = resolveBillableItem(scopeItem, item.subItemId);

    const rate   = target?.rate   ?? 0;
    const amount = rate * item.billedQty;
    const plannedQty = target?.plannedQty ?? 0;

    // createBillRequest already set target.lastBilledQty = completedQty (an
    // absolute value, not additive) at request time, so by now it already
    // reflects the post-this-bill cumulative — back this bill's own qty out
    // of it to get what was billed before it.
    const cumulativeBilledQty = target?.lastBilledQty ?? item.billedQty;
    const previouslyBilledQty = Math.max(0, cumulativeBilledQty - item.billedQty);
    const varianceQty = plannedQty > 0 ? Math.max(0, cumulativeBilledQty - plannedQty) : 0;

    return {
      scopeItemId: item.scopeItemId,
      subItemId:   item.subItemId,
      description: item.description,
      remarks:     target?.remarks   || '',
      progressRemarks: item.progressRemarks || '',
      location:        item.location || '',
      unit:        item.unit,
      plannedQty,
      billedQty:   item.billedQty,
      rate,
      amount,
      previouslyBilledQty,
      cumulativeBilledQty,
      varianceQty,
      // Snapshot the AGM/GM sign-off that already had to happen (see
      // hasUnapprovedVarianceForLineItem in createBillRequest) before this
      // over-plan quantity could even reach a bill request — this bill just
      // carries a permanent copy of it, not a new approval of its own.
      ...(varianceQty > 0 ? {
        varianceApproved:      !!target?.varianceApproved,
        varianceApprovedBy:    target?.varianceApprovedBy || null,
        varianceApprovedAt:    target?.varianceApprovedAt || null,
        varianceApprovedAtQty: target?.varianceApprovedAtQty ?? null,
      } : {}),
    };
  });

  const totalAmount     = lineItems.reduce((s, l) => s + l.amount, 0);
  const retentionAmount = br.retentionAmount || 0;
  const advanceRecovery = br.advanceRecovery || 0;
  const billNo = await nextBillNo();

  const runningBill = await RunningBill.create({
    billNo,
    workOrderId: wo._id,
    workOrderNo: wo.workOrderNo,
    projectId:   wo.projectId,
    projectName: wo.projectName,
    projectLocation: wo.projectLocation,
    vendorCode:  br.payeeVendorCode || wo.vendorCode,
    vendorName:  br.payeeVendorName || wo.vendorName,
    companyName: wo.companyName,
    department:       wo.department       || '',
    customDepartment: wo.customDepartment || '',
    billDate:    new Date(),
    lineItems,
    amount:           totalAmount,
    retentionPercent: wo.retentionPercent ?? 0,
    retentionAmount,
    advanceRecovery,
    gstPercent:  br.gstPercentOverride ?? (wo.gstPercent ?? 18),
    tdsPercent:  0,
    generatedBy: req.user.name,
    status:      'draft',
    agmApprovedBy: br.agmApprovedBy,
    agmApprovedAt: br.agmApprovedAt,
    // Carried onto the bill itself exactly like the AGM's L1 sign-off above
    // — only ever set for the levels this department's config actually used
    // (br.gmApprovedBy/l3ApprovedBy/l4ApprovedBy stay unset otherwise), so
    // the bill's own pills reflect the pre-Accounts gate that already
    // happened rather than staying permanently blank.
    gmApprovedBy: br.gmApprovedBy,
    gmApprovedAt: br.gmApprovedAt,
    l3ApprovedBy: br.l3ApprovedBy,
    l3ApprovedAt: br.l3ApprovedAt,
    l4ApprovedBy: br.l4ApprovedBy,
    l4ApprovedAt: br.l4ApprovedAt,
    verifiedBy:  req.user._id,
    verifiedAt:  new Date(),
    createdBy:   req.user._id,
  });

  br.items = br.items.map((item, i) => ({
    ...item.toObject(),
    rate:   lineItems[i].rate,
    amount: lineItems[i].amount,
  }));
  br.status      = 'approved';
  br.billId      = runningBill._id;
  br.processedBy = req.user._id;
  br.processedAt = new Date();
  br.approvalHistory.push({ stage: finalStage, action: 'approved', by: req.user._id, byName: req.user.name, byRole: req.user.role, remarks: req.body.remarks || '' });
  await br.save();

  // Apply AGM's advance-slip recoveries now that the bill actually exists —
  // same point (bill creation) the manual Billing flow applies its own.
  if (br.advanceRecoveries?.length) {
    await applyAdvanceRecoveries(br.advanceRecoveries, { billNo, releasedBy: req.user.name });
  }

  emitEvent('BILL_REQUEST_APPROVED', {
    projectId:     wo.projectId,
    workOrderId:   wo._id,
    workOrderNo:   wo.workOrderNo,
    billRequestId: br._id,
    runningBillId: runningBill._id,
    vendorCode:    wo.vendorCode,
    vendorName:    wo.vendorName,
    stageNo:       br.stageNo,
    user:          req.user,
    metadata:      { reqNo: br.reqNo, billNo, totalAmount },
  });

  await advanceInstance('BillRequest', br._id, req.user._id, `${finalStage.toUpperCase()} approved`);

  await logAudit({
    action: 'APPROVE', module: 'bill-requests', user: req.user,
    description: `${finalStage.toUpperCase()} approved ${br.reqNo} — generated bill ${billNo} (₹${totalAmount.toLocaleString('en-IN')})`,
    entityType: 'BillRequest', entityId: br._id, entityLabel: br.reqNo,
  });

  // Born with manualApprovalStatus already 'approved' (progress-driven, not a
  // manually-typed bill — see RunningBill model default), so it's immediately
  // ready for Accounts to verify, same as any manual bill past its own
  // AGM/GM sign-off (see billController.manualGmApprove's own notify below).
  notifySlack('PAYMENT_VERIFY_APPROVAL', runningBill);

  return { billRequest: br, bill: runningBill, message: `Approved — Bill ${billNo} generated for Stage ${br.stageNo}` };
}

// PUT /api/bill-requests/:id/gm-approve — Stage 2 (L2). For the default
// 2-level department this is the final stage and creates the RunningBill
// (via finalizeBillRequest); a department configured for 3/4 levels instead
// moves the request on to L3. Defined as a plain named function (not
// directly exports.gmApprove) purely so its body reads the same way as the
// l3/l4 handlers below; asyncHandler wraps it for the actual route.
async function gmApproveHandler(req, res) {
  const br = await BillRequest.findById(req.params.id);
  if (!br) return notFound(res, 'Bill request not found');
  if (!canActOnDepartment(req.user, br)) return forbidden(res, 'This bill request belongs to a different department.');
  if (br.status !== 'pending-gm') return badRequest(res, `Request is already ${br.status}`);
  if (br.agmApprovedBy && br.agmApprovedBy.toString() === req.user._id.toString() && req.user.role !== 'owner') {
    return badRequest(res, 'The AGM who approved this cannot also give GM sign-off — segregation of duties requires a different approver.');
  }

  const approvalConfig = await getApprovalConfig(br);
  if (!approverAllowed(req.user, approvalConfig, 'gm')) {
    return forbidden(res, "You're not configured as an L2 (GM) approver for this department.");
  }

  const wo = await WorkOrder.findById(br.workOrderId);
  if (!wo) return notFound(res, 'Associated work order not found');

  // GM can fill in whatever AGM left blank, or re-edit AGM's own figures —
  // these aren't locked in until the bill actually gets created (finalize-
  // BillRequest reads them straight off `br`), so it's safe to overwrite
  // here right up to that point, at any stage this department's chain has.
  if (req.body.retentionAmount != null) br.retentionAmount = Number(req.body.retentionAmount);
  if (req.body.gstPercent != null) {
    const gst = Number(req.body.gstPercent);
    if (Number.isNaN(gst) || gst < 0 || gst > 100) return badRequest(res, 'GST% must be a number between 0 and 100');
    br.gstPercentOverride = gst;
  }
  if (req.body.advanceRecovery != null) {
    br.advanceRecovery = Number(req.body.advanceRecovery);
    br.advanceRecoveries = Array.isArray(req.body.advanceRecoveries) ? req.body.advanceRecoveries : [];
  }

  br.gmApprovedBy = req.user._id;
  br.gmApprovedAt = new Date();
  br.approvalHistory.push({ stage: 'gm', action: 'approved', by: req.user._id, byName: req.user.name, byRole: req.user.role, remarks: req.body.remarks || '' });

  const totalLevels = approvalConfig?.requiredApprovals ?? 2;
  if (totalLevels >= 3) {
    br.status = 'pending-l3';
    await br.save();
    notifySlack('BILL_REQUEST_L3_APPROVAL', br);
    return success(res, { billRequest: br }, `L2 approved — Stage ${br.stageNo} moved to L3 approval`);
  }

  const result = await finalizeBillRequest(br, wo, req, res, 'gm');
  if (!result) return; // finalizeBillRequest already sent the error response
  success(res, result, result.message);
}
exports.gmApprove = asyncHandler(gmApproveHandler);

// PUT /api/bill-requests/:id/l3-approve — only reached when this department
// is configured for 3 or 4 approval levels (Users → Departments); the route
// itself is open to everyone, but a 2-level (or unconfigured) department's
// request can never actually reach status 'pending-l3' for this to act on.
async function l3ApproveHandler(req, res) {
  const br = await BillRequest.findById(req.params.id);
  if (!br) return notFound(res, 'Bill request not found');
  if (!canActOnDepartment(req.user, br)) return forbidden(res, 'This bill request belongs to a different department.');
  if (br.status !== 'pending-l3') return badRequest(res, `Request is already ${br.status}`);
  // Same segregation-of-duty rule agmApprove/gmApprove already enforce
  // between L1 and L2 — the person who just signed off at L2 can't also be
  // the one signing off at L3.
  if (br.gmApprovedBy && br.gmApprovedBy.toString() === req.user._id.toString() && req.user.role !== 'owner') {
    return badRequest(res, 'The GM who approved this cannot also give L3 sign-off — segregation of duties requires a different approver.');
  }

  const approvalConfig = await getApprovalConfig(br);
  if (!approverAllowed(req.user, approvalConfig, 'l3')) {
    return forbidden(res, "You're not configured as an L3 approver for this department.");
  }

  const wo = await WorkOrder.findById(br.workOrderId);
  if (!wo) return notFound(res, 'Associated work order not found');

  // Same fill-in-or-re-edit ability as the AGM/GM stages above — nothing is
  // locked in until finalizeBillRequest actually creates the RunningBill.
  if (req.body.retentionAmount != null) br.retentionAmount = Number(req.body.retentionAmount);
  if (req.body.gstPercent != null) {
    const gst = Number(req.body.gstPercent);
    if (Number.isNaN(gst) || gst < 0 || gst > 100) return badRequest(res, 'GST% must be a number between 0 and 100');
    br.gstPercentOverride = gst;
  }
  if (req.body.advanceRecovery != null) {
    br.advanceRecovery = Number(req.body.advanceRecovery);
    br.advanceRecoveries = Array.isArray(req.body.advanceRecoveries) ? req.body.advanceRecoveries : [];
  }

  br.l3ApprovedBy = req.user._id;
  br.l3ApprovedAt = new Date();
  br.approvalHistory.push({ stage: 'l3', action: 'approved', by: req.user._id, byName: req.user.name, byRole: req.user.role, remarks: req.body.remarks || '' });

  const totalLevels = approvalConfig?.requiredApprovals ?? 2;
  if (totalLevels >= 4) {
    br.status = 'pending-l4';
    await br.save();
    notifySlack('BILL_REQUEST_L4_APPROVAL', br);
    return success(res, { billRequest: br }, `L3 approved — Stage ${br.stageNo} moved to L4 approval`);
  }

  const result = await finalizeBillRequest(br, wo, req, res, 'l3');
  if (!result) return;
  success(res, result, result.message);
}
exports.l3Approve = asyncHandler(l3ApproveHandler);

// PUT /api/bill-requests/:id/l4-approve — always the final stage (4 is the
// max configurable level today), so this always finalizes the bill.
async function l4ApproveHandler(req, res) {
  const br = await BillRequest.findById(req.params.id);
  if (!br) return notFound(res, 'Bill request not found');
  if (!canActOnDepartment(req.user, br)) return forbidden(res, 'This bill request belongs to a different department.');
  if (br.status !== 'pending-l4') return badRequest(res, `Request is already ${br.status}`);
  if (br.l3ApprovedBy && br.l3ApprovedBy.toString() === req.user._id.toString() && req.user.role !== 'owner') {
    return badRequest(res, 'The L3 approver cannot also give L4 sign-off — segregation of duties requires a different approver.');
  }

  const approvalConfig = await getApprovalConfig(br);
  if (!approverAllowed(req.user, approvalConfig, 'l4')) {
    return forbidden(res, "You're not configured as an L4 approver for this department.");
  }

  const wo = await WorkOrder.findById(br.workOrderId);
  if (!wo) return notFound(res, 'Associated work order not found');

  if (req.body.retentionAmount != null) br.retentionAmount = Number(req.body.retentionAmount);
  if (req.body.gstPercent != null) {
    const gst = Number(req.body.gstPercent);
    if (Number.isNaN(gst) || gst < 0 || gst > 100) return badRequest(res, 'GST% must be a number between 0 and 100');
    br.gstPercentOverride = gst;
  }
  if (req.body.advanceRecovery != null) {
    br.advanceRecovery = Number(req.body.advanceRecovery);
    br.advanceRecoveries = Array.isArray(req.body.advanceRecoveries) ? req.body.advanceRecoveries : [];
  }

  br.l4ApprovedBy = req.user._id;
  br.l4ApprovedAt = new Date();
  br.approvalHistory.push({ stage: 'l4', action: 'approved', by: req.user._id, byName: req.user.name, byRole: req.user.role, remarks: req.body.remarks || '' });

  const result = await finalizeBillRequest(br, wo, req, res, 'l4');
  if (!result) return;
  success(res, result, result.message);
}
exports.l4Approve = asyncHandler(l4ApproveHandler);

// PUT /api/bill-requests/:id/reject — from any pending stage (pending,
// pending-gm, pending-l3, pending-l4).
exports.rejectBillRequest = asyncHandler(async (req, res) => {
  const br = await BillRequest.findById(req.params.id);
  if (!br) return notFound(res, 'Bill request not found');
  if (!canActOnDepartment(req.user, br)) return forbidden(res, 'This bill request belongs to a different department.');
  const REJECTABLE_STAGES = { pending: 'agm', 'pending-gm': 'gm', 'pending-l3': 'l3', 'pending-l4': 'l4' };
  const rejectedStage = REJECTABLE_STAGES[br.status];
  if (!rejectedStage) return badRequest(res, `Request is already ${br.status}`);

  const rejectReason = req.body.rejectReason || 'No reason provided';

  // Roll back lastBilledQty so DRI can re-bill after fixing their progress. A
  // rejected request means the progress it was made from was wrong — auto-
  // invalidate those entries (reason = the rejection reason) rather than just
  // freeing them, so they stay visible as history but never count toward
  // progress/billing again. The DRI logs fresh, correct progress from scratch.
  const wo = await WorkOrder.findById(br.workOrderId);
  if (wo) {
    for (const item of br.items) {
      if (!item.scopeItemId) continue;
      const si = wo.scopeItems.id(item.scopeItemId);
      if (!si) continue;
      const target = resolveBillableItem(si, item.subItemId);
      if (!target) continue;
      target.lastBilledQty = Math.max(0, (target.lastBilledQty || 0) - item.billedQty);
      // Bill requests created before per-particular billing existed have no
      // subItemId — their marked progress entries could be sitting on ANY of
      // the parent's particulars (the old code marked across all of them), not
      // on the parent's own progressEntries. Search every plausible location
      // so a legacy pending request still un-marks its real entry on reject.
      const entrySources = item.subItemId
        ? [target]
        : (si.subItems && si.subItems.length > 0 ? si.subItems : [target]);
      for (const src of entrySources) {
        for (const entry of src.progressEntries) {
          if (entry.billedInRequestId && String(entry.billedInRequestId) === String(br._id) && !entry.invalidated?.done) {
            entry.invalidated = { done: true, by: req.user._id, at: new Date(), reason: rejectReason };
            entry.billedInRequestId = null;
          }
        }
      }
      recomputeAfterInvalidate(si);
    }
    await wo.save();
  }

  br.status       = 'rejected';
  br.rejectReason = rejectReason;
  br.processedBy  = req.user._id;
  br.processedAt  = new Date();
  br.approvalHistory.push({ stage: rejectedStage, action: 'rejected', by: req.user._id, byName: req.user.name, byRole: req.user.role, remarks: rejectReason });
  await br.save();

  emitEvent('BILL_REQUEST_REJECTED', {
    projectId:     br.projectId || (wo ? wo.projectId : undefined),
    workOrderId:   br.workOrderId,
    workOrderNo:   br.workOrderNo,
    billRequestId: br._id,
    vendorCode:    br.vendorCode,
    vendorName:    br.vendorName,
    stageNo:       br.stageNo,
    user:          req.user,
    metadata:      { reqNo: br.reqNo, reason: br.rejectReason },
  });

  await cancelInstance('BillRequest', br._id, `Rejected: ${br.rejectReason}`);

  await logAudit({
    action: 'REJECT', module: 'bill-requests', user: req.user,
    description: `Rejected ${br.reqNo}${br.rejectReason ? ` — ${br.rejectReason}` : ''}`,
    entityType: 'BillRequest', entityId: br._id, entityLabel: br.reqNo,
  });

  settleAllPendingForEntity(br._id, { verb: 'Rejected', decidedByName: req.user.name })
    .catch((err) => console.error('[slack] settle on reject failed', err.message));

  success(res, { billRequest: br }, `Stage ${br.stageNo} rejected — DRI can re-submit after corrections`);
});

// Payment release now happens exclusively via the Accounts Payment module
// (billController.releasePayment), which also syncs milestoneAchieved on this
// BillRequest and processes AdvanceSlip recoveries — see that function for the
// single canonical release path.

// POST /api/bill-requests/batch
// Creates one bill request per work order, all grouped under a shared batchId.
exports.createBatchBillRequest = asyncHandler(async (req, res) => {
  const { workOrderIds, remarks } = req.body;

  if (!Array.isArray(workOrderIds) || workOrderIds.length === 0) {
    return badRequest(res, 'Provide at least one work order ID');
  }

  const batchId = `BATCH-${Date.now()}`;
  const created = [];
  const skipped = [];

  for (const workOrderId of workOrderIds) {
    const wo = await WorkOrder.findById(workOrderId);
    if (!wo) { skipped.push({ workOrderId, reason: 'Not found' }); continue; }

    if (req.user.role === 'site-dri') {
      const isAssigned = (wo.assignedDRI || []).some(
        id => id.toString() === req.user._id.toString()
      );
      if (!isAssigned) { skipped.push({ workOrderId, reason: 'Not assigned' }); continue; }
    }

    if (!isWorkOrderApproved(wo)) {
      skipped.push({ workOrderId, reason: `Not yet fully approved (currently ${wo.approvalStatus})` });
      continue;
    }

    const existing = await BillRequest.findOne({ workOrderId: wo._id, status: { $in: ['pending', 'pending-gm', 'pending-l3', 'pending-l4'] } });
    if (existing) { skipped.push({ workOrderId, reason: `Stage ${existing.stageNo} already pending` }); continue; }

    const pendingItems = expandBillableCandidates(wo.scopeItems)
      .map(c => ({
        ...c,
        billedQty: Math.max(0, c.completedQty - c.lastBilledQty),
      }))
      .filter(it => it.billedQty > 0);

    if (!pendingItems.length) { skipped.push({ workOrderId, reason: 'No pending progress' }); continue; }

    const stageNo    = await BillRequest.countDocuments({ workOrderId: wo._id }) + 1;
    const lastBR     = await BillRequest.findOne({ workOrderId: wo._id }).sort({ createdAt: -1 }).select('periodTo');
    const periodFrom = lastBR?.periodTo ?? wo.issueDate ?? new Date();
    const periodTo   = new Date();
    const reqNo      = await nextReqNo();
    const billRequestId = new mongoose.Types.ObjectId();

    // This is Owner's direct-bypass path — bills everything pending without a
    // variance gate, but still carries progress remarks through for free.
    const progressRemarksByItem = new Map();
    for (const pi of pendingItems) {
      const si = wo.scopeItems.id(pi.scopeItemId);
      const target = resolveBillableItem(si, pi.subItemId);
      progressRemarksByItem.set(String(pi.subItemId || pi.scopeItemId), collectAndMarkProgressRemarks(target, billRequestId));
    }

    const br = await BillRequest.create({
      _id: billRequestId,
      reqNo, stageNo,
      workOrderId: wo._id,
      workOrderNo: wo.workOrderNo,
      projectId:   wo.projectId || null,
      projectName: wo.projectName,
      projectLocation: wo.projectLocation,
      vendorCode:  wo.vendorCode,
      vendorName:  wo.vendorName,
      companyName: wo.companyName,
      category:    wo.category    || '',
      subCategory: wo.subCategory || '',
      department:       wo.department       || '',
      customDepartment: wo.customDepartment || '',
      periodFrom, periodTo,
      items: pendingItems.map(it => ({
        scopeItemId: it.scopeItemId,
        subItemId:   it.subItemId,
        description: it.description,
        unit:        it.unit,
        billedQty:   it.billedQty,
        rate:        it.rate,
        amount:      it.rate * it.billedQty,
        progressRemarks: progressRemarksByItem.get(String(it.subItemId || it.scopeItemId))?.remarks || '',
        location:        progressRemarksByItem.get(String(it.subItemId || it.scopeItemId))?.location || '',
      })),
      remarks:     remarks || '',
      requestedBy: req.user._id,
      batchId,
    });

    const touchedParents = new Set();
    for (const pi of pendingItems) {
      const si = wo.scopeItems.id(pi.scopeItemId);
      const target = resolveBillableItem(si, pi.subItemId);
      if (target) target.lastBilledQty = pi.completedQty;
      if (pi.subItemId) touchedParents.add(String(pi.scopeItemId));
    }
    for (const scopeItemId of touchedParents) {
      const si = wo.scopeItems.id(scopeItemId);
      if (si) recomputeParentFromSubItems(si);
    }
    await wo.save();

    emitEvent('BILL_REQUESTED', {
      projectId:     wo.projectId,
      workOrderId:   wo._id,
      workOrderNo:   wo.workOrderNo,
      billRequestId: br._id,
      vendorCode:    wo.vendorCode,
      vendorName:    wo.vendorName,
      stageNo,
      user:          req.user,
      metadata:      { reqNo, batchId },
    });

    const batchEstimatedAmount = pendingItems.reduce((s, it) => s + it.billedQty * (it.rate || 0), 0);
    await startInstance('BillRequest', br._id, br.reqNo, req.user._id, {
      projectId: wo.projectId, projectName: wo.projectName, vendorName: wo.vendorName, amount: batchEstimatedAmount,
    });

    await logAudit({
      action: 'CREATE', module: 'bill-requests', user: req.user,
      description: `Bill request ${reqNo} created`,
      entityType: 'BillRequest', entityId: br._id, entityLabel: reqNo,
    });

    notifySlack('BILL_REQUEST_AGM_APPROVAL', br);

    created.push(br);
  }

  if (!created.length) {
    return badRequest(res, `No work orders could be billed. ${skipped.map(s => s.reason).join('; ')}`);
  }

  res.status(201).json({
    success: true,
    message: `Bill request submitted for ${created.length} work order${created.length !== 1 ? 's' : ''} across ${new Set(created.map(b => b.projectName)).size} project${new Set(created.map(b => b.projectName)).size !== 1 ? 's' : ''}`,
    billRequests: created,
    batchId,
    skipped,
  });
});

// ── Archive / Unarchive ────────────────────────────────────────
// Archiving a request also archives its linked Running Bill (if approved and billed).
exports.archiveBillRequest = asyncHandler(async (req, res) => {
  const br = await BillRequest.findById(req.params.id);
  if (!br) return notFound(res, 'Bill request not found');
  br.isArchived = true;
  br.archivedAt = new Date();
  await br.save();
  if (br.billId) await RunningBill.findByIdAndUpdate(br.billId, { isArchived: true, archivedAt: new Date() });

  await logAudit({
    action: 'UPDATE', module: 'bill-requests', user: req.user,
    description: `Bill request ${br.reqNo} archived`,
    entityType: 'BillRequest', entityId: br._id, entityLabel: br.reqNo,
  });

  success(res, { billRequest: br }, 'Bill request archived');
});

exports.unarchiveBillRequest = asyncHandler(async (req, res) => {
  const br = await BillRequest.findById(req.params.id);
  if (!br) return notFound(res, 'Bill request not found');
  br.isArchived = false;
  br.archivedAt = null;
  await br.save();
  if (br.billId) await RunningBill.findByIdAndUpdate(br.billId, { isArchived: false, archivedAt: null });

  await logAudit({
    action: 'UPDATE', module: 'bill-requests', user: req.user,
    description: `Bill request ${br.reqNo} unarchived`,
    entityType: 'BillRequest', entityId: br._id, entityLabel: br.reqNo,
  });

  success(res, { billRequest: br }, 'Bill request unarchived');
});

// PATCH /api/bill-requests/archive-bulk  — body: { ids: string[] }
exports.archiveBillRequestsBulk = asyncHandler(async (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) return badRequest(res, 'Provide at least one bill request id');
  const requests = await BillRequest.find({ _id: { $in: ids } }).select('billId');
  const billIds = requests.map(r => r.billId).filter(Boolean);
  await BillRequest.updateMany({ _id: { $in: ids } }, { isArchived: true, archivedAt: new Date() });
  if (billIds.length) await RunningBill.updateMany({ _id: { $in: billIds } }, { isArchived: true, archivedAt: new Date() });
  success(res, {}, `${ids.length} bill request(s) archived`);
});

// PATCH /api/bill-requests/unarchive-bulk  — body: { ids: string[] }
exports.unarchiveBillRequestsBulk = asyncHandler(async (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) return badRequest(res, 'Provide at least one bill request id');
  const requests = await BillRequest.find({ _id: { $in: ids } }).select('billId');
  const billIds = requests.map(r => r.billId).filter(Boolean);
  await BillRequest.updateMany({ _id: { $in: ids } }, { isArchived: false, archivedAt: null });
  if (billIds.length) await RunningBill.updateMany({ _id: { $in: billIds } }, { isArchived: false, archivedAt: null });
  success(res, {}, `${ids.length} bill request(s) unarchived`);
});
