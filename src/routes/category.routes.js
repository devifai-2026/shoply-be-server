const router = require('express').Router();
const ctrl   = require('../controllers/category.controller');
const { protect } = require('../middleware/auth');
const { uploadCategoryImage } = require('../middleware/upload');

router.use(protect);

router.get('/',           ctrl.list);
router.get('/flat',       ctrl.flat);
router.post('/reorder',   ctrl.reorder);
router.post('/',          uploadCategoryImage, ctrl.create);
router.get('/:id',        ctrl.getOne);
router.put('/:id',        uploadCategoryImage, ctrl.update);
router.delete('/:id',     ctrl.remove);

module.exports = router;
