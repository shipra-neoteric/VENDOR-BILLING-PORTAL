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
