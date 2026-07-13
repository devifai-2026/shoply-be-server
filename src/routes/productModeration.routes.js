const router = require('express').Router();
const ctrl   = require('../controllers/productModeration.controller');
const { protect, authorize } = require('../middleware/auth');

router.use(protect);
const adminOnly = authorize('superadmin', 'admin');

router.get('/',              adminOnly, ctrl.list);
router.patch('/:id/approve', adminOnly, ctrl.approve);
router.patch('/:id/reject',  adminOnly, ctrl.reject);
router.patch('/bulk-approve', adminOnly, ctrl.bulkApprove);

module.exports = router;
