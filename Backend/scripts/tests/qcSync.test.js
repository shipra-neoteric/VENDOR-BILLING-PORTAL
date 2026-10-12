// Phase 1 regression tests for the VMS -> QC DPR/Drawing Request sync
// (src/utils/syncToQc.js). Plain Node, no test framework and no real Mongo
// connection — neither this repo nor QC's has a test runner installed, and
// adding one is out of scope for this phase. Run with:
//   node scripts/tests/qcSync.test.js
// Exits non-zero on any failure (for CI use).

const assert = require('assert');
const path = require('path');
const Module = require('module');

// ── In-memory fakes ─────────────────────────────────────────────────────
// A fake QC Mongo "db" — only the .collection(name).find/findOne/insertOne/
// updateOne surface that syncToQc.js actually calls.
function makeFakeQcDb(seed = {}) {
  const store = {
    projects: seed.projects || [],
    users: seed.users || [],
    dpr: seed.dpr || [],
    drawingRequests: seed.drawingRequests || [],
  };
  return {
    _store: store,
    collection(name) {
      return {
        find(query = {}) {
          return { toArray: async () => store[name] };
        },
        findOne: async (query) => store[name].find((doc) => Object.keys(query).every((k) => doc[k] === query[k])) || null,
        insertOne: async (doc) => { store[name].push(doc); return { insertedId: doc.id }; },
        updateOne: async (query, update) => {
          const doc = store[name].find((d) => Object.keys(query).every((k) => d[k] === query[k]));
          if (doc && update.$set) Object.assign(doc, update.$set);
          return { matchedCount: doc ? 1 : 0 };
        },
      };
    },
  };
}

// A fake QcSyncFailure Mongoose model — only findOneAndUpdate/updateOne, the
// two calls syncToQc.js's logFailure/clearFailure actually use.
function makeFakeQcSyncFailureModel() {
  const docs = [];
  return {
    _docs: docs,
    findOneAndUpdate: async (query, update, opts) => {
      let doc = docs.find((d) => d.type === query.type && d.sourceId === query.sourceId);
      if (!doc && opts && opts.upsert) {
        doc = { type: query.type, sourceId: query.sourceId, attempts: 0 };
        docs.push(doc);
      }
      if (doc) {
        if (update.$set) Object.assign(doc, update.$set);
        if (update.$inc) for (const k of Object.keys(update.$inc)) doc[k] = (doc[k] || 0) + update.$inc[k];
      }
      return doc;
    },
    updateOne: async (query, update) => {
      const doc = docs.find((d) =>
        d.type === query.type && d.sourceId === query.sourceId && (query.resolvedAt === undefined || d.resolvedAt === query.resolvedAt)
      );
      if (doc && update.$set) Object.assign(doc, update.$set);
      return { matchedCount: doc ? 1 : 0 };
    },
  };
}

// Load syncToQc.js with qcMongoClient.js and models/QcSyncFailure.js
// substituted for the fakes above, via the module cache — no real Mongo
// connection needed, and no change to the two real source files.
function loadSyncToQcWithFakes({ qcDb, failureModel }) {
  const syncToQcPath = require.resolve('../../src/utils/syncToQc');
  const qcMongoClientPath = require.resolve('../../src/utils/qcMongoClient');
  const qcSyncFailurePath = require.resolve('../../src/models/QcSyncFailure');

  delete require.cache[syncToQcPath];
  require.cache[qcMongoClientPath] = new Module(qcMongoClientPath);
  require.cache[qcMongoClientPath].exports = { getQcDb: async () => qcDb };
  require.cache[qcSyncFailurePath] = new Module(qcSyncFailurePath);
  require.cache[qcSyncFailurePath].exports = failureModel;

  return require('../../src/utils/syncToQc');
}

// ── Tests ───────────────────────────────────────────────────────────────
const results = [];
async function test(name, fn) {
  try {
    await fn();
    results.push({ name, pass: true });
  } catch (err) {
    results.push({ name, pass: false, err });
  }
}

async function run() {
  const { makeId, normalizeProjectName, resolveProject } = require('../../src/utils/syncToQc');

  await test('makeId — DPR-VMS-<id> convention preserved', () => {
    assert.strictEqual(makeId('DPR', 'abc123'), 'DPR-VMS-abc123');
    assert.strictEqual(makeId('DR', 'xyz789'), 'DR-VMS-xyz789');
  });

  await test('normalizeProjectName — case/whitespace/separator insensitive', () => {
    assert.strictEqual(normalizeProjectName('  Nature_Park-Hotel  '), 'nature park hotel');
  });

  await test('resolveProject — matches by QC project id first (checked before name)', async () => {
    // resolveProject's "code" match actually compares the passed code against
    // the QC record's own `id` (falling back to `code`) field — confirmed by
    // reading src/utils/syncToQc.js directly, not assumed.
    const qcDb = makeFakeQcDb({ projects: [{ id: 'PRJ-01', code: 'NTA', name: 'Nature Park Hotel' }] });
    const result = await resolveProject(qcDb, 'Some Different Name', 'PRJ-01');
    assert.strictEqual(result.id, 'PRJ-01');
  });

  await test('resolveProject — falls back to name match when no code match', async () => {
    const qcDb = makeFakeQcDb({ projects: [{ id: 'PRJ-02', code: 'ZZZ', name: 'Hyde park' }] });
    const result = await resolveProject(qcDb, 'Hyde Park', null);
    assert.strictEqual(result.id, 'PRJ-02');
  });

  await test('resolveProject — falls back to PROJECT_MAPPINGS, else returns null (unmapped)', async () => {
    const qcDb = makeFakeQcDb({ projects: [] });
    const mapped = await resolveProject(qcDb, 'Hyde park', null);
    assert.strictEqual(mapped.id, 'PRJ-012'); // from qcProjectMappings.js
    const unmapped = await resolveProject(qcDb, 'Totally Unknown Project XYZ', null);
    assert.strictEqual(unmapped, null);
  });

  await test('syncDprToQc — idempotent: re-syncing an existing id never duplicates', async () => {
    const qcDb = makeFakeQcDb({ dpr: [{ id: 'DPR-VMS-507f1f77bcf86cd799439011' }] });
    const failureModel = makeFakeQcSyncFailureModel();
    const { syncDprToQc } = loadSyncToQcWithFakes({ qcDb, failureModel });
    await syncDprToQc({ _id: '507f1f77bcf86cd799439011', projectName: 'whatever', workEntries: [] });
    assert.strictEqual(qcDb._store.dpr.length, 1, 'no duplicate inserted for an id that already exists');
  });

  await test('syncDprToQc — unmapped project is logged as a retriable failure, not thrown', async () => {
    const qcDb = makeFakeQcDb({ projects: [] });
    const failureModel = makeFakeQcSyncFailureModel();
    const { syncDprToQc } = loadSyncToQcWithFakes({ qcDb, failureModel });
    await syncDprToQc({ _id: 'aaa111', projectName: 'Totally Unknown Project XYZ', workEntries: [] });
    assert.strictEqual(qcDb._store.dpr.length, 0, 'nothing inserted for an unmapped project');
    assert.strictEqual(failureModel._docs.length, 1);
    assert.strictEqual(failureModel._docs[0].type, 'dpr');
    assert.strictEqual(failureModel._docs[0].sourceId, 'aaa111');
    assert.ok(failureModel._docs[0].resolvedAt === null || failureModel._docs[0].resolvedAt === undefined);
  });

  await test('syncDprToQc — a successful sync clears any prior logged failure for the same record', async () => {
    const qcDb = makeFakeQcDb({ projects: [{ id: 'PRJ-01', code: 'NTA', name: 'Nature Park Hotel' }] });
    const failureModel = makeFakeQcSyncFailureModel();
    failureModel._docs.push({ type: 'dpr', sourceId: 'bbb222', reason: 'project not mapped on QC yet', resolvedAt: null, attempts: 1 });
    const { syncDprToQc } = loadSyncToQcWithFakes({ qcDb, failureModel });
    await syncDprToQc({ _id: 'bbb222', projectName: 'Nature Park Hotel', workEntries: [] });
    assert.strictEqual(qcDb._store.dpr.length, 1, 'record inserted once the mapping gap is fixed');
    assert.ok(failureModel._docs[0].resolvedAt instanceof Date, 'failure record marked resolved, not deleted');
  });

  await test('syncDprToQc — a QC connection failure is caught and logged, never thrown (fire-and-forget safety)', async () => {
    const failureModel = makeFakeQcSyncFailureModel();
    const syncToQcPath = require.resolve('../../src/utils/syncToQc');
    const qcMongoClientPath = require.resolve('../../src/utils/qcMongoClient');
    const qcSyncFailurePath = require.resolve('../../src/models/QcSyncFailure');
    delete require.cache[syncToQcPath];
    require.cache[qcMongoClientPath] = new Module(qcMongoClientPath);
    require.cache[qcMongoClientPath].exports = { getQcDb: async () => { throw new Error('ECONNREFUSED (simulated QC outage)'); } };
    require.cache[qcSyncFailurePath] = new Module(qcSyncFailurePath);
    require.cache[qcSyncFailurePath].exports = failureModel;
    const { syncDprToQc } = require('../../src/utils/syncToQc');

    await assert.doesNotReject(() => syncDprToQc({ _id: 'ccc333', projectName: 'Nature Park Hotel', workEntries: [] }));
    assert.strictEqual(failureModel._docs.length, 1);
    assert.ok(failureModel._docs[0].reason.includes('QC connection failed'));
  });

  await test('syncDrawingRequestToQc — updating an already-synced request never re-inserts a duplicate', async () => {
    const qcDb = makeFakeQcDb({ drawingRequests: [{ id: 'DR-VMS-ddd444', reviewStatus: 'stage-1-screen', files: [] }] });
    const failureModel = makeFakeQcSyncFailureModel();
    const { syncDrawingRequestToQc } = loadSyncToQcWithFakes({ qcDb, failureModel });
    await syncDrawingRequestToQc({ _id: 'ddd444', projectName: 'Nature Park Hotel', reviewStatus: 'l2-architect', drawingFiles: [] });
    assert.strictEqual(qcDb._store.drawingRequests.length, 1, 'still exactly one record, not duplicated');
    assert.strictEqual(qcDb._store.drawingRequests[0].reviewStatus, 'stage-2-produce', 'stage was advanced in place');
  });

  // ── Phase 2: syncDprToQcViaApi ──────────────────────────────────────────
  // fetch is a Node global (no import to mock) — stub/restore it per test.
  const realFetch = global.fetch;
  function stubFetch(handler) { global.fetch = handler; }
  function restoreFetch() { global.fetch = realFetch; }

  await test('syncDprToQcViaApi — posts the exact same doc shape the direct-db path would insert', async () => {
    const qcDb = makeFakeQcDb({ projects: [{ id: 'PRJ-01', code: 'NTA', name: 'Nature Park Hotel' }] });
    const failureModel = makeFakeQcSyncFailureModel();
    const { syncDprToQcViaApi, buildDprDoc, makeId } = loadSyncToQcWithFakes({ qcDb, failureModel });
    process.env.QC_API_BASE_URL = 'https://qc.example.test';
    process.env.VMS_SYNC_SECRET = 'test-secret';
    let captured = null;
    stubFetch(async (url, opts) => {
      captured = { url, opts };
      return { ok: true, status: 200, json: async () => ({ ok: true, id: JSON.parse(opts.body).id, created: true }) };
    });
    try {
      const report = { _id: 'eee555', projectName: 'Nature Park Hotel', vendorCode: 'VC-01', workEntries: [{ workType: 'Civil', images: [{ url: 'https://x/1.jpg' }] }] };
      await syncDprToQcViaApi(report);
      assert.strictEqual(captured.url, 'https://qc.example.test/api/integrations/vms/dpr');
      assert.strictEqual(captured.opts.headers['X-Vms-Sync-Secret'], 'test-secret');
      const sentDoc = JSON.parse(captured.opts.body);
      const expectedDoc = buildDprDoc(makeId('DPR', 'eee555'), report, { id: 'PRJ-01', name: 'Nature Park Hotel' }, null);
      assert.deepStrictEqual(sentDoc, expectedDoc, 'API payload must be byte-identical to what the direct-db path would have inserted');
      assert.strictEqual(qcDb._store.dpr.length, 0, 'API path never writes to Mongo directly — only the HTTP call does');
    } finally {
      restoreFetch();
      delete process.env.QC_API_BASE_URL;
      delete process.env.VMS_SYNC_SECRET;
    }
  });

  await test('syncDprToQcViaApi — an existing id (created:false from QC) clears any prior logged failure, same as a fresh insert', async () => {
    const qcDb = makeFakeQcDb({ projects: [{ id: 'PRJ-01', code: 'NTA', name: 'Nature Park Hotel' }] });
    const failureModel = makeFakeQcSyncFailureModel();
    failureModel._docs.push({ type: 'dpr', sourceId: 'fff666', reason: 'QC API responded 500', resolvedAt: null, attempts: 2 });
    const { syncDprToQcViaApi } = loadSyncToQcWithFakes({ qcDb, failureModel });
    process.env.QC_API_BASE_URL = 'https://qc.example.test';
    process.env.VMS_SYNC_SECRET = 'test-secret';
    stubFetch(async () => ({ ok: true, status: 200, json: async () => ({ ok: true, created: false }) }));
    try {
      await syncDprToQcViaApi({ _id: 'fff666', projectName: 'Nature Park Hotel', workEntries: [] });
      assert.ok(failureModel._docs[0].resolvedAt instanceof Date);
    } finally {
      restoreFetch();
      delete process.env.QC_API_BASE_URL;
      delete process.env.VMS_SYNC_SECRET;
    }
  });

  await test('syncDprToQcViaApi — 401 (bad secret) is caught, logged as a retriable failure, never thrown', async () => {
    const qcDb = makeFakeQcDb({ projects: [{ id: 'PRJ-01', code: 'NTA', name: 'Nature Park Hotel' }] });
    const failureModel = makeFakeQcSyncFailureModel();
    const { syncDprToQcViaApi } = loadSyncToQcWithFakes({ qcDb, failureModel });
    process.env.QC_API_BASE_URL = 'https://qc.example.test';
    process.env.VMS_SYNC_SECRET = 'wrong-secret';
    stubFetch(async () => ({ ok: false, status: 401, json: async () => ({ error: 'Invalid VMS sync secret' }) }));
    try {
      await assert.doesNotReject(() => syncDprToQcViaApi({ _id: 'ggg777', projectName: 'Nature Park Hotel', workEntries: [] }));
      assert.strictEqual(failureModel._docs.length, 1);
      assert.ok(failureModel._docs[0].reason.includes('401'));
    } finally {
      restoreFetch();
      delete process.env.QC_API_BASE_URL;
      delete process.env.VMS_SYNC_SECRET;
    }
  });

  await test('syncDprToQcViaApi — 400 (invalid payload/unmapped project) is caught and logged, never thrown', async () => {
    const qcDb = makeFakeQcDb({ projects: [{ id: 'PRJ-01', code: 'NTA', name: 'Nature Park Hotel' }] });
    const failureModel = makeFakeQcSyncFailureModel();
    const { syncDprToQcViaApi } = loadSyncToQcWithFakes({ qcDb, failureModel });
    process.env.QC_API_BASE_URL = 'https://qc.example.test';
    process.env.VMS_SYNC_SECRET = 'test-secret';
    stubFetch(async () => ({ ok: false, status: 400, json: async () => ({ error: 'projectId "PRJ-99" is not a known QC project' }) }));
    try {
      await assert.doesNotReject(() => syncDprToQcViaApi({ _id: 'hhh888', projectName: 'Nature Park Hotel', workEntries: [] }));
      assert.strictEqual(failureModel._docs.length, 1);
      assert.ok(failureModel._docs[0].reason.includes('400'));
    } finally {
      restoreFetch();
      delete process.env.QC_API_BASE_URL;
      delete process.env.VMS_SYNC_SECRET;
    }
  });

  await test('syncDprToQcViaApi — a network/fetch-level failure is caught, logged, and retriable (not thrown)', async () => {
    const qcDb = makeFakeQcDb({ projects: [{ id: 'PRJ-01', code: 'NTA', name: 'Nature Park Hotel' }] });
    const failureModel = makeFakeQcSyncFailureModel();
    const { syncDprToQcViaApi } = loadSyncToQcWithFakes({ qcDb, failureModel });
    process.env.QC_API_BASE_URL = 'https://qc.example.test';
    process.env.VMS_SYNC_SECRET = 'test-secret';
    stubFetch(async () => { throw new Error('ECONNREFUSED (simulated QC API outage)'); });
    try {
      await assert.doesNotReject(() => syncDprToQcViaApi({ _id: 'iii999', projectName: 'Nature Park Hotel', workEntries: [] }));
      assert.strictEqual(failureModel._docs.length, 1);
      assert.ok(failureModel._docs[0].reason.includes('ECONNREFUSED'));
    } finally {
      restoreFetch();
      delete process.env.QC_API_BASE_URL;
      delete process.env.VMS_SYNC_SECRET;
    }
  });

  await test('syncDprToQcViaApi — passes a 10s AbortSignal.timeout so an unreachable QC never hangs indefinitely', async () => {
    const qcDb = makeFakeQcDb({ projects: [{ id: 'PRJ-01', code: 'NTA', name: 'Nature Park Hotel' }] });
    const failureModel = makeFakeQcSyncFailureModel();
    const { syncDprToQcViaApi } = loadSyncToQcWithFakes({ qcDb, failureModel });
    process.env.QC_API_BASE_URL = 'https://qc.example.test';
    process.env.VMS_SYNC_SECRET = 'test-secret';
    let capturedSignal = null;
    stubFetch(async (url, opts) => {
      capturedSignal = opts.signal;
      return { ok: true, status: 200, json: async () => ({ ok: true, created: true }) };
    });
    try {
      await syncDprToQcViaApi({ _id: 'jjj000', projectName: 'Nature Park Hotel', workEntries: [] });
      assert.ok(capturedSignal instanceof AbortSignal, 'fetch must be called with an AbortSignal');
      assert.strictEqual(capturedSignal.aborted, false, 'the 10s timeout must not have already elapsed for a fast, successful call');
    } finally {
      restoreFetch();
      delete process.env.QC_API_BASE_URL;
      delete process.env.VMS_SYNC_SECRET;
    }
  });

  await test('syncDprToQcViaApi — a timeout (AbortSignal fires) is caught, logged as retriable, never thrown, never falsely reports success', async () => {
    const qcDb = makeFakeQcDb({ projects: [{ id: 'PRJ-01', code: 'NTA', name: 'Nature Park Hotel' }] });
    const failureModel = makeFakeQcSyncFailureModel();
    const { syncDprToQcViaApi } = loadSyncToQcWithFakes({ qcDb, failureModel });
    process.env.QC_API_BASE_URL = 'https://qc.example.test';
    process.env.VMS_SYNC_SECRET = 'test-secret';
    // Simulates exactly what Node's fetch throws when an AbortSignal.timeout
    // fires mid-request — a DOMException named "TimeoutError", not a plain
    // Error. The call must still be caught and logged like any other
    // failure, not crash or report a false success.
    stubFetch(async () => { throw new DOMException('The operation timed out.', 'TimeoutError'); });
    try {
      await assert.doesNotReject(() => syncDprToQcViaApi({ _id: 'kkk111', projectName: 'Nature Park Hotel', workEntries: [] }));
      assert.strictEqual(qcDb._store.dpr.length, 0, 'a timed-out call must never be treated as a successful insert');
      assert.strictEqual(failureModel._docs.length, 1);
      assert.strictEqual(failureModel._docs[0].type, 'dpr');
      assert.ok(failureModel._docs[0].reason.includes('timed out') || failureModel._docs[0].reason.includes('TimeoutError'));
      assert.ok(failureModel._docs[0].resolvedAt === null || failureModel._docs[0].resolvedAt === undefined, 'logged as still-unresolved, i.e. retriable');
    } finally {
      restoreFetch();
      delete process.env.QC_API_BASE_URL;
      delete process.env.VMS_SYNC_SECRET;
    }
  });

  await test('syncDprToQcViaApi — after a logged timeout failure, a subsequent successful retry clears it (retry recovery intact)', async () => {
    const qcDb = makeFakeQcDb({ projects: [{ id: 'PRJ-01', code: 'NTA', name: 'Nature Park Hotel' }] });
    const failureModel = makeFakeQcSyncFailureModel();
    failureModel._docs.push({ type: 'dpr', sourceId: 'lll222', reason: 'The operation timed out.', resolvedAt: null, attempts: 1 });
    const { syncDprToQcViaApi } = loadSyncToQcWithFakes({ qcDb, failureModel });
    process.env.QC_API_BASE_URL = 'https://qc.example.test';
    process.env.VMS_SYNC_SECRET = 'test-secret';
    stubFetch(async () => ({ ok: true, status: 200, json: async () => ({ ok: true, created: true }) }));
    try {
      await syncDprToQcViaApi({ _id: 'lll222', projectName: 'Nature Park Hotel', workEntries: [] });
      // API mode never writes to qcDb directly — only the HTTP call does
      // (confirmed by the "never writes to Mongo directly" test above) — so
      // the thing to verify here is the failure getting cleared, not qcDb.
      assert.ok(failureModel._docs[0].resolvedAt instanceof Date, 'the earlier timeout failure is now marked resolved');
    } finally {
      restoreFetch();
      delete process.env.QC_API_BASE_URL;
      delete process.env.VMS_SYNC_SECRET;
    }
  });

  await test('syncDprToQcViaApi — a hung QC request times out, is caught and logged, and never reports success', async () => {
    const qcDb = makeFakeQcDb({ projects: [{ id: 'PRJ-01', code: 'NTA', name: 'Nature Park Hotel' }] });
    const failureModel = makeFakeQcSyncFailureModel();
    const { syncDprToQcViaApi } = loadSyncToQcWithFakes({ qcDb, failureModel });
    process.env.QC_API_BASE_URL = 'https://qc.example.test';
    process.env.VMS_SYNC_SECRET = 'test-secret';
    // Simulates exactly what AbortSignal.timeout(10000) does to fetch() when
    // QC hangs instead of erroring — the real code's signal isn't hit at all
    // here (10s is too slow for a test run), this just reproduces fetch's
    // own rejection shape so the error-propagation path is verified without
    // actually waiting out a real timeout.
    stubFetch(async () => {
      const err = new Error('The operation was aborted due to timeout');
      err.name = 'TimeoutError';
      throw err;
    });
    try {
      await assert.doesNotReject(() => syncDprToQcViaApi({ _id: 'lll222', projectName: 'Nature Park Hotel', workEntries: [] }));
      assert.strictEqual(qcDb._store.dpr.length, 0, 'a timed-out call must never be treated as a successful sync');
      assert.strictEqual(failureModel._docs.length, 1);
      assert.strictEqual(failureModel._docs[0].resolvedAt, null, 'stays open/unresolved — it genuinely failed');
      assert.ok(/abort|timeout/i.test(failureModel._docs[0].reason), 'logged reason should be identifiable as a timeout, not a mystery failure');
    } finally {
      restoreFetch();
      delete process.env.QC_API_BASE_URL;
      delete process.env.VMS_SYNC_SECRET;
    }
  });

  await test('syncDprToQcViaApi — a later retry after a timeout succeeds and clears the logged failure (retry recovery intact)', async () => {
    const qcDb = makeFakeQcDb({ projects: [{ id: 'PRJ-01', code: 'NTA', name: 'Nature Park Hotel' }] });
    const failureModel = makeFakeQcSyncFailureModel();
    failureModel._docs.push({ type: 'dpr', sourceId: 'lll222', reason: 'QC API timed out after 10000ms', resolvedAt: null, attempts: 1 });
    const { syncDprToQcViaApi } = loadSyncToQcWithFakes({ qcDb, failureModel });
    process.env.QC_API_BASE_URL = 'https://qc.example.test';
    process.env.VMS_SYNC_SECRET = 'test-secret';
    stubFetch(async () => ({ ok: true, status: 200, json: async () => ({ ok: true, created: true }) }));
    try {
      await syncDprToQcViaApi({ _id: 'lll222', projectName: 'Nature Park Hotel', workEntries: [] });
      assert.ok(failureModel._docs[0].resolvedAt instanceof Date, 'a successful retry after a timeout must clear the logged failure');
    } finally {
      restoreFetch();
      delete process.env.QC_API_BASE_URL;
      delete process.env.VMS_SYNC_SECRET;
    }
  });

  await test('syncDprToQc — VMS_SYNC_MODE=api routes through the API path, not the direct-db insert', async () => {
    const qcDb = makeFakeQcDb({ projects: [{ id: 'PRJ-01', code: 'NTA', name: 'Nature Park Hotel' }] });
    const failureModel = makeFakeQcSyncFailureModel();
    process.env.VMS_SYNC_MODE = 'api';
    process.env.QC_API_BASE_URL = 'https://qc.example.test';
    process.env.VMS_SYNC_SECRET = 'test-secret';
    let fetchCalled = false;
    stubFetch(async () => { fetchCalled = true; return { ok: true, status: 200, json: async () => ({ ok: true, created: true }) }; });
    try {
      const { syncDprToQc } = loadSyncToQcWithFakes({ qcDb, failureModel });
      await syncDprToQc({ _id: 'jjj000', projectName: 'Nature Park Hotel', workEntries: [] });
      assert.ok(fetchCalled, 'VMS_SYNC_MODE=api must route the default entry point through the API, not Mongo');
      assert.strictEqual(qcDb._store.dpr.length, 0, 'no direct insert when mode is api');
    } finally {
      restoreFetch();
      delete process.env.VMS_SYNC_MODE;
      delete process.env.QC_API_BASE_URL;
      delete process.env.VMS_SYNC_SECRET;
    }
  });

  await test('syncDprToQc — default VMS_SYNC_MODE (unset) still uses the direct-db path, unchanged (rollback safety)', async () => {
    const qcDb = makeFakeQcDb({ projects: [{ id: 'PRJ-01', code: 'NTA', name: 'Nature Park Hotel' }] });
    const failureModel = makeFakeQcSyncFailureModel();
    assert.strictEqual(process.env.VMS_SYNC_MODE, undefined, 'test isolation check');
    let fetchCalled = false;
    stubFetch(async () => { fetchCalled = true; return { ok: true, status: 200, json: async () => ({}) }; });
    try {
      const { syncDprToQc } = loadSyncToQcWithFakes({ qcDb, failureModel });
      await syncDprToQc({ _id: 'kkk111', projectName: 'Nature Park Hotel', workEntries: [] });
      assert.strictEqual(fetchCalled, false, 'default mode must never call the API');
      assert.strictEqual(qcDb._store.dpr.length, 1, 'default mode still inserts directly, exactly as before Phase 2');
    } finally {
      restoreFetch();
    }
  });

  // ── Report ──
  console.log('');
  for (const r of results) {
    console.log(`${r.pass ? '✓' : '✗'} ${r.name}`);
    if (!r.pass) console.log(`    ${r.err.message}`);
  }
  const failed = results.filter((r) => !r.pass);
  console.log('');
  console.log(`${results.length - failed.length}/${results.length} passed`);
  if (failed.length) process.exit(1);
}

run().catch((err) => {
  console.error('Test runner crashed:', err);
  process.exit(1);
});
