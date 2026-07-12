const router = require('express').Router();
const ctrl   = require('../controllers/otp.controller');

// Public — no auth needed
router.post('/send',   ctrl.sendOtp);
router.post('/verify', ctrl.verifyOtp);

module.exports = router;
