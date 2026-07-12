const router = require('express').Router();
const ctrl   = require('../controllers/auth.controller');
const { protect } = require('../middleware/auth');

router.post('/login',           ctrl.login);
router.post('/logout',          protect, ctrl.logout);
router.get('/me',               protect, ctrl.me);
router.put('/change-password',  protect, ctrl.changePassword);

module.exports = router;
