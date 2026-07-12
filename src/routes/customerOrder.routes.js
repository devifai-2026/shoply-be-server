const router = require('express').Router();
const ctrl   = require('../controllers/customerOrder.controller');
const { protectCustomer } = require('../middleware/customerAuth');

router.use(protectCustomer);

router.post('/',              ctrl.createOrder);
router.get('/',               ctrl.getMyOrders);
router.get('/:id',            ctrl.getMyOrder);
router.get('/:id/track',      ctrl.trackOrder);
router.get('/:id/invoice',    ctrl.getInvoice);
router.patch('/:id/cancel',   ctrl.cancelOrder);

module.exports = router;
