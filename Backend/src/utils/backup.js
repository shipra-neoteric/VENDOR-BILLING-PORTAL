const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const { EJSON } = require('bson');
const AdmZip = require('adm-zip');

const MODELS_DIR = path.join(__dirname, '..', 'models');
const INSERT_BATCH_SIZE = 500;

// Every model file registers itself with mongoose on require() — there's no
// central models/index.js, so this is the one place that walks the directory
// instead of hard-listing 26 names that would silently drift out of sync the
// next time someone adds a model.
function listModels() {
  fs.readdirSync(MODELS_DIR)
    .filter((f) => f.endsWith('.js'))
    .forEach((f) => require(path.join(MODELS_DIR, f)));
  return mongoose.modelNames().map((name) => ({ name, Model: mongoose.model(name) }));
}

// Builds the full backup archive as an in-memory Buffer. One collection at a
// time (not the whole DB at once) — peak memory is bounded by the single
// largest collection, not the sum of all 26. EJSON (not plain JSON) so
// ObjectId/Date fields round-trip correctly through restoreFromZip below,
// keeping cross-collection references (e.g. WorkOrder.projectId -> Project._id)
// intact.
async function exportBackupZip() {
  const zip = new AdmZip();
  const models = listModels();
  const manifest = {
    createdAt: new Date().toISOString(),
    collections: [],
  };

  for (const { name, Model } of models) {
    const docs = await Model.find({}).lean();
    const collectionName = Model.collection.collectionName;
    zip.addFile(`${collectionName}.json`, Buffer.from(EJSON.stringify(docs), 'utf8'));
    manifest.collections.push({ model: name, collection: collectionName, count: docs.length });
  }

  zip.addFile('manifest.json', Buffer.from(JSON.stringify(manifest, null, 2), 'utf8'));
  return zip.toBuffer();
}

// Wipes every currently-registered collection and replaces it with whatever
// the uploaded archive contains for it — deliberately destructive, matching
// this feature's own on-page warning verbatim. A known collection with no
// matching file in the archive ends up empty, not silently left alone; that's
// "delete all, replace with what's in the file," not a partial merge.
async function restoreFromZip(buffer) {
  let zip;
  try {
    zip = new AdmZip(buffer);
  } catch (err) {
    throw new Error('Uploaded file is not a valid .zip archive');
  }

  const manifestEntry = zip.getEntry('manifest.json');
  if (!manifestEntry) {
    throw new Error('Uploaded file does not look like a backup from this tool (missing manifest.json)');
  }
  let manifest;
  try {
    manifest = JSON.parse(zip.readAsText(manifestEntry));
  } catch {
    throw new Error('manifest.json in the uploaded file is corrupted');
  }
  if (!Array.isArray(manifest.collections)) {
    throw new Error('manifest.json in the uploaded file is not in the expected shape');
  }

  const models = listModels();
  const results = [];

  // Everything above this point is pure validation — nothing in the database
  // has been touched yet. From here on, each model is attempted independently
  // and its own failure doesn't stop the rest: an admin restoring 26
  // collections should get 25 successes and one clearly-flagged failure to
  // fix by hand, not an opaque abort partway through with no idea what state
  // the database was left in.
  for (const { name, Model } of models) {
    const collectionName = Model.collection.collectionName;
    try {
      const entry = zip.getEntry(`${collectionName}.json`);

      await Model.deleteMany({});

      if (!entry) {
        results.push({ model: name, collection: collectionName, restored: 0, note: 'not present in uploaded file — left empty' });
        continue;
      }

      const docs = EJSON.parse(zip.readAsText(entry));
      for (let i = 0; i < docs.length; i += INSERT_BATCH_SIZE) {
        const batch = docs.slice(i, i + INSERT_BATCH_SIZE);
        if (batch.length) await Model.insertMany(batch, { ordered: false });
      }
      results.push({ model: name, collection: collectionName, restored: docs.length });
    } catch (err) {
      results.push({ model: name, collection: collectionName, error: err.message });
    }
  }

  return results;
}

module.exports = { listModels, exportBackupZip, restoreFromZip };
