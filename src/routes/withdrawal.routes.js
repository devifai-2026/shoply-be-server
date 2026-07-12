const router = require('express').Router();
const ctrl   = require('../controllers/withdrawalAdmin.controller');
const { protect, authorize } = require('../middleware/auth');
const { uploadPayoutScreenshot } = require('../middleware/upload');

router.use(protect);

router.get('/', ctrl.list);

const adminOnly = authorize('superadmin', 'admin');
router.patch('/:id/pay',    adminOnly, uploadPayoutScreenshot, ctrl.markPaid);
router.patch('/:id/reject', adminOnly, ctrl.reject);

module.exports = router;
