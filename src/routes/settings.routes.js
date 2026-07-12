const router = require('express').Router();
const ctrl   = require('../controllers/settings.controller');
const { protect, authorize } = require('../middleware/auth');

router.use(protect);

const adminOnly = authorize('superadmin', 'admin');

router.get('/',              ctrl.get);
router.put('/general',       adminOnly, ctrl.updateGeneral);
router.put('/regional',      adminOnly, ctrl.updateRegional);
router.put('/operational',   adminOnly, ctrl.updateOperational);
router.put('/seo',           adminOnly, ctrl.updateSEO);
router.put('/orders',        adminOnly, ctrl.updateOrders);
router.put('/social',        adminOnly, ctrl.updateSocial);
router.put('/shipping',      adminOnly, ctrl.updateShipping);
router.put('/reviews',       adminOnly, ctrl.updateReviews);
router.get('/sms',           adminOnly, ctrl.getSms);
router.put('/sms',           adminOnly, ctrl.updateSms);

module.exports = router;
