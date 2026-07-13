const router = require('express').Router();
const ctrl   = require('../controllers/order.controller');
const { protect, authorize } = require('../middleware/auth');

router.use(protect);
const adminOnly = authorize('superadmin', 'admin');

router.get('/export',        ctrl.exportCSV);
router.get('/',              ctrl.list);
router.post('/',             ctrl.create);
router.patch('/bulk-status', adminOnly, ctrl.bulkUpdateStatus);
router.get('/:id',           ctrl.getOne);
router.patch('/:id/status',  ctrl.updateStatus);
router.get('/:id/invoice',   ctrl.printInvoice);

module.exports = router;
