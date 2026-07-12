const router = require('express').Router();
const ctrl   = require('../controllers/offer.controller');
const { protect } = require('../middleware/auth');

router.use(protect);

router.get('/stats', ctrl.getStats);
router.get('/',      ctrl.list);
router.post('/',     ctrl.create);
router.get('/:id',   ctrl.getOne);
router.put('/:id',   ctrl.update);
router.delete('/:id', ctrl.remove);
router.patch('/:id/toggle', ctrl.toggle);

module.exports = router;
