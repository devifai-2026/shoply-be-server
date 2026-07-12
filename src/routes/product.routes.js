const router = require('express').Router();
const ctrl   = require('../controllers/product.controller');
const { protect } = require('../middleware/auth');
const { uploadProductImages } = require('../middleware/upload');

router.use(protect);

router.get('/',           ctrl.list);
router.post('/',          uploadProductImages, ctrl.create);
router.get('/:id',        ctrl.getOne);
router.put('/:id',        ctrl.update);
router.delete('/:id',     ctrl.remove);

router.post('/:id/images',         uploadProductImages, ctrl.addImages);
router.delete('/:id/images',       ctrl.removeImage);
router.patch('/:id/stock',         ctrl.updateStock);

module.exports = router;
