const router = require('express').Router();
const ctrl   = require('../controllers/notification.controller');
const { protect } = require('../middleware/auth');

router.use(protect);

router.get('/',                ctrl.list);
router.patch('/read-all',      ctrl.markAllRead);
router.delete('/clear',        ctrl.clearAll);
router.patch('/:id/read',      ctrl.markRead);
router.delete('/:id',          ctrl.remove);

module.exports = router;
