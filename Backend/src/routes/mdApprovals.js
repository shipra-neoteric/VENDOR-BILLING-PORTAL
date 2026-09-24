const router = require('express').Router();
const { authenticate } = require('../middleware/auth');
const { listMdApprovals, getMdApprovalDetail } = require('../controllers/mdApprovalsController');

router.use(authenticate);

// The controller itself does the real permission gate (across all 3
// underlying modules) — no single authorizeOr(module, action) fits a
// cross-cutting aggregator like this one.
router.get('/', listMdApprovals);
router.get('/:system/:id', getMdApprovalDetail);

module.exports = router;
