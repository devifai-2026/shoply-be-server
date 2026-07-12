const router = require('express').Router();
const ctrl   = require('../controllers/flashSale.controller');
const { protect } = require('../middleware/auth');
const { uploadBanner } = require('../middleware/upload');

router.use(protect);

router.get('/stats',                      ctrl.getStats);
router.get('/active',                     ctrl.getActive);
router.get('/',                           ctrl.list);
router.post('/',                          uploadBanner, ctrl.create);
router.get('/:id',                        ctrl.getOne);
router.put('/:id',                        uploadBanner, ctrl.update);
router.delete('/:id',                     ctrl.remove);
router.patch('/:id/toggle',               ctrl.toggle);
router.post('/:id/products',              ctrl.addProduct);
router.delete('/:id/products/:productId', ctrl.removeProduct);

module.exports = router;
