const router = require('express').Router();
const ctrl   = require('../controllers/pushNotification.controller');
const { protect } = require('../middleware/auth');

router.use(protect);

router.get('/stats',    ctrl.getStats);
router.get('/',         ctrl.list);
router.post('/send',    ctrl.send);
router.post('/schedule', ctrl.schedule);

module.exports = router;
