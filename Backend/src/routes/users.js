const express = require('express');
const router  = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const ctrl = require('../controllers/userController');

const adminOnly = [authenticate, authorize('owner', 'gm')];

router.get('/',                       ...adminOnly, ctrl.listUsers);
router.post('/',                      ...adminOnly, ctrl.createUser);
router.put('/:id',                    ...adminOnly, ctrl.updateUser);
router.patch('/:id/password',         ...adminOnly, ctrl.changePassword);
router.delete('/:id',                 ...adminOnly, ctrl.deleteUser);

module.exports = router;
