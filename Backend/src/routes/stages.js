const router = require('express').Router();
const { authenticate, authorize } = require('../middleware/auth');
const {
  listStages, createStage, updateStage, deleteStage,
} = require('../controllers/stageController');

router.use(authenticate);
router.get('/',    listStages);
router.post('/',   authorize('owner', 'gm', 'engineer'), createStage);
router.put('/:id', authorize('owner', 'gm', 'engineer'), updateStage);
router.delete('/:id', authorize('owner', 'gm'),          deleteStage);

module.exports = router;
