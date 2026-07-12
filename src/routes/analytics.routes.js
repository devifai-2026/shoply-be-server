const router = require('express').Router();
const ctrl   = require('../controllers/analytics.controller');
const { protect } = require('../middleware/auth');

router.use(protect);
router.get('/summary',          ctrl.getSummary);
router.get('/top-products',     ctrl.getTopProducts);
router.get('/sales-by-category', ctrl.getSalesByCategory);
router.get('/export',           ctrl.exportReport);

module.exports = router;
