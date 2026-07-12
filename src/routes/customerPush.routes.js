const router = require('express').Router();
const ctrl   = require('../controllers/customerPush.controller');
const { protectCustomer } = require('../middleware/customerAuth');

router.get('/vapid-key',   ctrl.getVapidKey);
router.post('/subscribe',  protectCustomer, ctrl.subscribe);
router.delete('/unsubscribe', protectCustomer, ctrl.unsubscribe);

module.exports = router;
