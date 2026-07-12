const router = require('express').Router();
const ctrl   = require('../controllers/dashboard.controller');
const { protect } = require('../middleware/auth');

router.use(protect);
router.get('/stats',          ctrl.getStats);
router.get('/recent-orders',  ctrl.getRecentOrders);
router.get('/platform-split', ctrl.getPlatformSplit);

module.exports = router;
