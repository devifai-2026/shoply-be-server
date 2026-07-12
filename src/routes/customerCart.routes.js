const router              = require('express').Router();
const ctrl                = require('../controllers/cart.controller');
const { protectCustomer } = require('../middleware/customerAuth');

router.use(protectCustomer);

router.get('/',              ctrl.getCart);
router.post('/sync',         ctrl.syncCart);
router.post('/:productId',   ctrl.addItem);
router.put('/:productId',    ctrl.updateItem);
router.delete('/:productId', ctrl.removeItem);
router.delete('/',           ctrl.clearCart);

module.exports = router;
