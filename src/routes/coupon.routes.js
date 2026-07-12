const router = require('express').Router();
const ctrl   = require('../controllers/coupon.controller');
const { protect } = require('../middleware/auth');

router.use(protect);

router.get('/stats',     ctrl.getStats);
router.post('/validate', ctrl.validate);
router.get('/',          ctrl.list);
router.post('/',         ctrl.create);
router.get('/:id',       ctrl.getOne);
router.put('/:id',       ctrl.update);
router.delete('/:id',    ctrl.remove);

module.exports = router;
