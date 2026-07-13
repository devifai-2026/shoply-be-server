const router = require('express').Router();
const ctrl   = require('../controllers/vendorAdmin.controller');
const { protect, authorize } = require('../middleware/auth');

router.use(protect);

router.get('/',      ctrl.list);
router.get('/stats', ctrl.stats);
router.get('/:id',   ctrl.get);

const adminOnly = authorize('superadmin', 'admin');
router.post('/',                  adminOnly, ctrl.create);
router.put('/:id',                adminOnly, ctrl.update);
router.patch('/:id/approve',      adminOnly, ctrl.approve);
router.patch('/:id/reject',       adminOnly, ctrl.reject);
router.patch('/:id/suspend',      adminOnly, ctrl.suspend);
router.patch('/:id/reactivate',   adminOnly, ctrl.reactivate);

router.get('/:id/products',  ctrl.listProducts);
router.get('/:id/suborders', ctrl.listSubOrders);

module.exports = router;
