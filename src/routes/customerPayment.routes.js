const router = require('express').Router();
const ctrl   = require('../controllers/payment.controller');
const { protectCustomer } = require('../middleware/customerAuth');

router.use(protectCustomer);

router.post('/initiate', ctrl.initiatePayment);
router.post('/verify',   ctrl.verifyPayment);

module.exports = router;
