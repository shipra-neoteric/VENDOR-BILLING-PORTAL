const router = require('express').Router();
const { authenticate } = require('../middleware/auth');
const {
  createRequest, listRequests, getRequest, updateRequest, deleteRequest,
} = require('../controllers/drawingRequestController');

router.use(authenticate);

router.get('/',    listRequests);
router.get('/:id', getRequest);
router.post('/',   createRequest);
router.put('/:id', updateRequest);
router.delete('/:id', deleteRequest);

module.exports = router;
