const router = require('express').Router();
const ctrl   = require('../controllers/visitors.controller');
const { protect } = require('../middleware/auth');

router.use(protect);
router.get('/summary', ctrl.getSummary);
router.get('/list',    ctrl.listVisits);
router.get('/map',     ctrl.getMapPoints);
router.get('/live',    ctrl.getLiveVisitors);

module.exports = router;
