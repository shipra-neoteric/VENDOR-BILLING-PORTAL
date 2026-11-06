const router = require('express').Router();
const { authenticate, authorizeOr } = require('../middleware/auth');
const { getUserMis, getUserMisDetail } = require('../controllers/userMisController');

router.use(authenticate);
// Feeds the MIS Report page (user table + a person's detail drawer), so both follow the MIS Report permission.
router.get('/', authorizeOr('mis-report', 'view', 'owner'), getUserMis);
router.get('/:userId', authorizeOr('mis-report', 'view', 'owner'), getUserMisDetail);

module.exports = router;
