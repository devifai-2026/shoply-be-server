const router = require('express').Router();
const ctrl   = require('../controllers/tracking.controller');

router.post('/event', ctrl.recordEvent);

module.exports = router;
