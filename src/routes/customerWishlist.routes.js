const router             = require('express').Router();
const ctrl               = require('../controllers/wishlist.controller');
const { protectCustomer } = require('../middleware/customerAuth');

router.use(protectCustomer);

router.get('/',              ctrl.getWishlist);
router.post('/:productId',   ctrl.toggleWishlist);
router.delete('/:productId', ctrl.removeFromWishlist);

module.exports = router;
