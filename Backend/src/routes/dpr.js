const router = require('express').Router();
const { authenticate } = require('../middleware/auth');
const { getDPR } = require('../controllers/dprController');

router.use(authenticate);

router.get('/', getDPR);

module.exports = router;
