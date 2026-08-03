const router = require('express').Router();
const { authenticate, authorizeOr } = require('../middleware/auth');
const {
  listVendorGroups, getVendorGroup, createVendorGroup, updateVendorGroup, getVendorGroupProgress,
} = require('../controllers/vendorGroupController');

router.use(authenticate);

router.get('/',            listVendorGroups);
router.get('/:id',         getVendorGroup);
router.get('/:id/progress', getVendorGroupProgress);
router.post('/',           authorizeOr('vendor-groups', 'create', 'owner', 'gm', 'accounts'), createVendorGroup);
router.put('/:id',         authorizeOr('vendor-groups', 'edit',   'owner', 'gm', 'accounts'), updateVendorGroup);

module.exports = router;
