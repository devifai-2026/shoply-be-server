const router = require('express').Router();
const ctrl   = require('../controllers/sponsoredSlot.controller');
const { protect } = require('../middleware/auth');

router.use(protect);

router.get('/',      ctrl.list);
router.post('/',     ctrl.create);
router.put('/:id',   ctrl.update);
router.delete('/:id', ctrl.remove);
router.patch('/:id/toggle', ctrl.toggle);

module.exports = router;
