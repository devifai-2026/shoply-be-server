const router = require('express').Router();
const ctrl   = require('../controllers/customer.controller');
const { protect, authorize } = require('../middleware/auth');

router.use(protect);
const adminOnly = authorize('superadmin', 'admin');

router.get('/export',              ctrl.exportCSV);
router.get('/resellers',           adminOnly, ctrl.listResellers);
router.get('/',                    ctrl.list);
router.patch('/bulk-block',        adminOnly, ctrl.bulkBlock);
router.patch('/bulk-unblock',      adminOnly, ctrl.bulkUnblock);
router.get('/:id',                 ctrl.getOne);
router.patch('/:id/block',         ctrl.block);
router.patch('/:id/unblock',       ctrl.unblock);
router.patch('/:id/reseller-margin', adminOnly, ctrl.setResellerMargin);
router.post('/:id/addresses',      ctrl.addAddress);

module.exports = router;
