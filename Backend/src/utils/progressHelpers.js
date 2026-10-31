// Shared helpers for recomputing a scope item's (or particular's) progress
// state after its progressEntries change — used by workOrderController.js
// (direct add/edit/delete/invalidate) and by billController.js/
// billRequestController.js (auto-invalidating entries when the bill made
// from them gets rejected).

// Invalidated entries (bad data, kept for audit) never count toward progress.
function sumActiveQty(entries) {
  return entries.filter(e => !e.invalidated?.done).reduce((s, e) => s + e.qtyAdded, 0);
}

// A measurement entry can carry its working instead of a typed-in number:
// dimensions.rows = [{ label, length, width, height, nos, deduct }]. Each row is
// the product of whichever of length/width/height/nos were filled; deduct rows
// (door/window cut-outs) subtract. The server is the source of truth for the
// resulting qty — a client-sent qtyAdded is ignored when rows are present.
// Without rows the entry is a plain direct quantity, exactly as before.
function resolveEntryQty(qtyAdded, dimensions) {
  const rawRows = dimensions && Array.isArray(dimensions.rows) ? dimensions.rows : [];
  if (rawRows.length === 0) return { qty: Number(qtyAdded), dimensions: undefined };
  if (rawRows.length > 50) return { error: 'Too many measurement rows (max 50)' };
  const rows = [];
  let total = 0;
  for (let i = 0; i < rawRows.length; i++) {
    const r = rawRows[i] || {};
    const row = { label: String(r.label || '').trim().slice(0, 80), deduct: !!r.deduct };
    for (const k of ['tower', 'floor', 'flatNo', 'plotNo']) row[k] = String(r[k] || '').trim().slice(0, 40);
    row.note = String(r.note || '').trim().slice(0, 300);
    let product = 1;
    let factors = 0;
    const hasQty = r.qty !== undefined && r.qty !== null && r.qty !== '';
    if (hasQty && ['length', 'width', 'height', 'nos'].some(k => r[k] !== undefined && r[k] !== null && r[k] !== '')) {
      return { error: `Row ${i + 1}: enter either a quantity or length / width / height / nos, not both` };
    }
    if (hasQty) {
      // A direct-quantity row: the number itself, no length/width/height.
      const v = Number(r.qty);
      if (!Number.isFinite(v) || v <= 0) return { error: `Row ${i + 1}: quantity must be greater than 0` };
      row.qty = v;
      product = v;
      factors = 1;
    } else {
      for (const k of ['length', 'width', 'height', 'nos']) {
        if (r[k] === undefined || r[k] === null || r[k] === '') continue;
        const v = Number(r[k]);
        if (!Number.isFinite(v) || v <= 0) return { error: `Row ${i + 1}: ${k} must be greater than 0` };
        row[k] = v;
        product *= v;
        factors++;
      }
    }
    if (factors === 0) return { error: `Row ${i + 1}: enter a quantity, or at least one of length / width / height / nos` };
    total += row.deduct ? -product : product;
    rows.push(row);
  }
  total = Math.round(total * 1e5) / 1e5;
  if (!(total > 0)) return { error: 'Total measured quantity must be greater than 0 after deductions' };
  return { qty: total, dimensions: { rows } };
}

// Uploaded supporting files on a measurement entry: [{ name, url }], max 5. Only https links on
// Cloudinary (where the app uploads them) are kept — same host rule as the public OCR endpoint.
function isCloudinaryUrl(u) {
  try { const x = new URL(u); return x.protocol === 'https:' && x.hostname === 'res.cloudinary.com'; } catch { return false; }
}

function cleanDocuments(docs) {
  if (!Array.isArray(docs)) return [];
  return docs
    .filter(d => d && typeof d.url === 'string' && isCloudinaryUrl(d.url))
    .slice(0, 5)
    .map(d => ({ name: String(d.name || 'Document').slice(0, 200), url: d.url }));
}

// Progress is never hard-blocked at plannedQty — AGM/GM see an over-logged item
// flagged (yellow ≤10% over, red beyond that, computed client-side) and must
// explicitly sign off before it can be billed. A prior sign-off only gets
// invalidated if completedQty actually changed since it was approved — not by
// an unrelated edit (e.g. fixing a remarks/location typo) that nets out to the
// same quantity.
function applyVarianceGate(target) {
  if (target.plannedQty > 0 && target.completedQty > target.plannedQty) {
    if (target.varianceApproved && target.completedQty !== target.varianceApprovedAtQty) {
      target.varianceApproved = false;
    }
  }
}

// When an item has particulars, its own status/completedQty are derived from
// them rather than tracked directly. Particulars typically share the SAME
// plannedQty (e.g. every trade on a floor is measured against that floor's
// full built-up area) — summing their completedQty against that one shared
// plannedQty is meaningless and shows the parent as done as soon as a single
// particular finishes. Instead, average each particular's own fraction of
// completion and project it back onto the parent's plannedQty, so the parent
// only reaches 100% once every particular individually has.
function recomputeParentFromSubItems(item) {
  if (!item.subItems || item.subItems.length === 0) return;
  const fractions = item.subItems.map(si =>
    si.plannedQty > 0 ? Math.min(1, (si.completedQty || 0) / si.plannedQty) : (si.status === 'completed' ? 1 : 0)
  );
  const avgFraction = fractions.reduce((s, f) => s + f, 0) / fractions.length;
  // A parent whose own plannedQty was never set (common when particulars
  // carry the real planned quantities — see ScopeItemsBuilder's "Particulars
  // are reference only" setup) must not have completedQty hard-pinned at 0
  // regardless of actual progress; fall back to the particulars' own planned
  // total as the baseline, same fallback the frontend already uses when
  // deriving a completion % from this field (getCompletionPct).
  const effectivePlanned = item.plannedQty || item.subItems.reduce((s, si) => s + (si.plannedQty || 0), 0);
  item.completedQty = Math.round(effectivePlanned * avgFraction);
  const allCompleted = item.subItems.every(si =>
    si.plannedQty > 0 ? si.completedQty >= si.plannedQty : si.status === 'completed'
  );
  const anyStarted = item.subItems.some(si => (si.completedQty || 0) > 0);
  item.status = allCompleted ? 'completed' : anyStarted ? 'running' : 'pending';
}

function deriveStatus(target) {
  return target.plannedQty > 0 && target.completedQty >= target.plannedQty ? 'completed'
    : target.completedQty > 0 ? 'running' : 'pending';
}

// Recomputes completedQty/status/variance for a scope item after some of its
// (or its particulars') entries were invalidated — handles both the flat and
// particular-bearing shapes.
function recomputeAfterInvalidate(si) {
  if (si.subItems && si.subItems.length > 0) {
    for (const sub of si.subItems) {
      sub.completedQty = sumActiveQty(sub.progressEntries);
      sub.status = deriveStatus(sub);
      applyVarianceGate(sub);
    }
    recomputeParentFromSubItems(si);
  } else {
    si.completedQty = sumActiveQty(si.progressEntries);
    si.status = deriveStatus(si);
    applyVarianceGate(si);
  }
}

// Expands a work order's scope items into individual billable candidates —
// one per particular when an item has them, one per item otherwise. Billing
// must operate at this granularity: a parent item's own completedQty is only
// ever a display rollup of its particulars (see recomputeParentFromSubItems
// above), never something to bill against directly — and each particular has
// its own rate/description that the resulting bill line needs to show.
function expandBillableCandidates(scopeItems, selectedIds, selectedSubIds) {
  const out = [];
  for (const si of scopeItems) {
    if (selectedIds && !selectedIds.has(String(si._id))) continue;
    if (si.subItems && si.subItems.length > 0) {
      // selectedSubIds = hand-picked particulars; when any of THIS item's are
      // picked, only those are billed (otherwise every particular, as before).
      const pickedHere = selectedSubIds && si.subItems.some(sub => selectedSubIds.has(String(sub._id)));
      for (const sub of si.subItems) {
        if (pickedHere && !selectedSubIds.has(String(sub._id))) continue;
        out.push({
          scopeItemId:   si._id,
          subItemId:     sub._id,
          description:   `${si.description} — ${sub.description}`,
          unit:          sub.unit || si.unit,
          completedQty:  sub.completedQty || 0,
          lastBilledQty: sub.lastBilledQty || 0,
          rate:          sub.rate || 0,
        });
      }
    } else {
      out.push({
        scopeItemId:   si._id,
        subItemId:     null,
        description:   si.description,
        unit:          si.unit,
        completedQty:  si.completedQty || 0,
        lastBilledQty: si.lastBilledQty || 0,
        rate:          si.rate || 0,
      });
    }
  }
  return out;
}

module.exports = { resolveEntryQty, cleanDocuments, sumActiveQty, applyVarianceGate, recomputeParentFromSubItems, deriveStatus, recomputeAfterInvalidate, expandBillableCandidates };
