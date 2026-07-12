const router = require('express').Router();
const ctrl   = require('../controllers/payment.controller');
const { protect, authorize } = require('../middleware/auth');

router.use(protect);

router.get('/stats',              ctrl.getStats);
router.get('/gateways',           authorize('superadmin', 'admin'), ctrl.getGateways);
router.put('/gateways/:slug',     authorize('superadmin', 'admin'), ctrl.updateGateway);
router.patch('/gateways/:slug/toggle',  authorize('superadmin', 'admin'), ctrl.toggleGateway);
router.patch('/gateways/:slug/sandbox', authorize('superadmin', 'admin'), ctrl.toggleSandbox);

module.exports = router;
