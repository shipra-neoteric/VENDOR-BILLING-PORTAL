const router     = require('express').Router();
const { body, validationResult } = require('express-validator');
const Contractor = require('../models/Contractor');
const { authenticate, authorize } = require('../middleware/auth');
const { nextVendorCode } = require('../utils/codeGen');

router.use(authenticate);

// GET /api/contractors
router.get('/', async (req, res) => {
  try {
    const { status, search } = req.query;
    const filter = {};
    if (status) filter.status = status;
    if (search) {
      filter.$or = [
        { vendorCode:   { $regex: search, $options: 'i' } },
        { companyName:  { $regex: search, $options: 'i' } },
        { ownerName:    { $regex: search, $options: 'i' } },
        { mobile:       { $regex: search, $options: 'i' } },
      ];
    }
    const contractors = await Contractor.find(filter).sort({ createdAt: -1 });
    res.json({ contractors });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/contractors/:id  (also supports lookup by vendorCode)
router.get('/:id', async (req, res) => {
  try {
    const contractor =
      await Contractor.findById(req.params.id).catch(() => null) ||
      await Contractor.findOne({ vendorCode: req.params.id });
    if (!contractor) return res.status(404).json({ message: 'Contractor not found' });
    res.json({ contractor });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/contractors
router.post(
  '/',
  authorize('owner', 'gm', 'accounts'),
  [
    body('companyName').notEmpty().withMessage('Company name is required'),
    body('ownerName').notEmpty().withMessage('Owner name is required'),
    body('mobile').notEmpty().withMessage('Mobile is required'),
    body('panNumber').notEmpty().withMessage('PAN number is required'),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    try {
      const vendorCode = await nextVendorCode();
      const contractor = await Contractor.create({
        ...req.body,
        vendorCode,
        createdBy: req.user._id,
      });
      res.status(201).json({ contractor });
    } catch (err) {
      res.status(500).json({ message: err.message });
    }
  }
);

// POST /api/contractors/bulk  — import multiple contractors from Excel
router.post('/bulk', authorize('owner', 'gm', 'accounts'), async (req, res) => {
  try {
    const rows = req.body.contractors;
    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ message: 'No contractor rows provided' });
    }

    const results = { created: [], skipped: [], errors: [] };

    for (const row of rows) {
      try {
        if (!row.companyName) {
          results.errors.push({ row: '?', reason: 'Missing company name' });
          continue;
        }
        // Skip if mobile already exists (only when mobile is provided)
        if (row.mobile) {
          const existing = await Contractor.findOne({ mobile: row.mobile });
          if (existing) {
            results.skipped.push({ row: row.companyName, reason: `Mobile ${row.mobile} already registered as ${existing.vendorCode}` });
            continue;
          }
        }
        const vendorCode = await nextVendorCode();
        const contractor = await Contractor.create({
          ...row,
          vendorCode,
          status: row.status || 'active',
          workTypes: Array.isArray(row.workTypes) ? row.workTypes : (row.workTypes ? String(row.workTypes).split(',').map(s => s.trim()).filter(Boolean) : []),
          createdBy: req.user._id,
        });
        results.created.push(contractor);
      } catch (err) {
        results.errors.push({ row: row.companyName || '?', reason: err.message });
      }
    }

    res.status(201).json(results);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PUT /api/contractors/:id
router.put('/:id', authorize('owner', 'gm', 'accounts'), async (req, res) => {
  try {
    const contractor = await Contractor.findByIdAndUpdate(
      req.params.id,
      { $set: req.body },
      { new: true, runValidators: true }
    );
    if (!contractor) return res.status(404).json({ message: 'Contractor not found' });
    res.json({ contractor });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
