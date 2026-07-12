const router = require('express').Router();
const ctrl   = require('../controllers/shipping.controller');
const { protect } = require('../middleware/auth');

// Public — no auth required
router.all('/webhooks/shiprocket',   ctrl.shiprocketWebhook);
router.all('/webhooks/delhivery',    ctrl.delhiveryWebhook);
router.get('/track/awb/:awb',        ctrl.trackByAwb);
router.get('/pickup-locations',      ctrl.getPickupLocations);

// Everything else requires admin auth
router.use(protect);

router.get('/stats',              ctrl.getStats);
router.get('/wallet-balance',     ctrl.getWalletBalance);
router.post('/calculate-rate',    ctrl.calculateRate);
router.post('/live-rates',        ctrl.getLiveRates);

// Shipment lifecycle
router.post('/book-shipment',     ctrl.bookShipment);
router.get('/track/:orderId',     ctrl.trackOrder);
router.post('/cancel-shipment',   ctrl.cancelShipment);

// Zones
router.get('/zones',              ctrl.listZones);
router.post('/zones',             ctrl.createZone);
router.put('/zones/:id',          ctrl.updateZone);
router.delete('/zones/:id',       ctrl.removeZone);

// Couriers
router.get('/couriers',                      ctrl.listCouriers);
router.patch('/couriers/:id/toggle',         ctrl.toggleCourier);
router.put('/couriers/:id/credentials',      ctrl.updateCourierCredentials);
router.post('/couriers/:id/test-connection', ctrl.testCourierConnection);

// Settings
router.get('/settings',           ctrl.getSettings);
router.put('/settings',           ctrl.updateSettings);

module.exports = router;
