const router = require('express').Router();
const { authenticate } = require('../middleware/auth');
const { createRequest, listRequests } = require('../controllers/drawingRequestController');

router.use(authenticate);

router.get('/',  listRequests);
router.post('/', createRequest);

module.exports = router;
