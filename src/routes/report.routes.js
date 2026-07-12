const router = require('express').Router();
const ctrl   = require('../controllers/report.controller');
const { protect } = require('../middleware/auth');

router.use(protect);

router.get('/summary',           ctrl.getSummary);
router.get('/sales-by-channel',  ctrl.getSalesByChannel);
router.get('/order-status',      ctrl.getOrderStatus);
router.get('/inventory-alerts',  ctrl.getInventoryAlerts);
router.get('/top-products',      ctrl.getTopProducts);
router.get('/top-customers',     ctrl.getTopCustomers);
router.get('/export',            ctrl.exportCSV);

module.exports = router;
