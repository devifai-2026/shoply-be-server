const router = require('express').Router();
const ctrl   = require('../controllers/brand.controller');
const { protect } = require('../middleware/auth');
const { uploadBrandLogo } = require('../middleware/upload');

router.use(protect);

router.get('/',        ctrl.list);
router.get('/flat',    ctrl.flat);
router.post('/',       uploadBrandLogo, ctrl.create);
router.get('/:id',     ctrl.getOne);
router.put('/:id',     uploadBrandLogo, ctrl.update);
router.delete('/:id',  ctrl.remove);
router.patch('/:id/toggle', ctrl.toggle);

module.exports = router;
