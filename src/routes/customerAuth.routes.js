const router = require('express').Router();
const ctrl   = require('../controllers/customerAuth.controller');
const { protectCustomer } = require('../middleware/customerAuth');

router.post('/register',         ctrl.register);
router.post('/login',            ctrl.login);
router.post('/forgot-password',  ctrl.forgotPassword);
router.post('/reset-password/:token', ctrl.resetPassword);
router.get('/me',                protectCustomer, ctrl.me);
router.put('/profile',           protectCustomer, ctrl.updateProfile);
router.put('/change-password',   protectCustomer, ctrl.changePassword);

// Addresses
router.get('/addresses',              protectCustomer, ctrl.getAddresses);
router.post('/addresses',             protectCustomer, ctrl.addAddress);
router.put('/addresses/:addressId',   protectCustomer, ctrl.updateAddress);
router.delete('/addresses/:addressId', protectCustomer, ctrl.deleteAddress);
router.patch('/addresses/:addressId/default', protectCustomer, ctrl.setDefaultAddress);

module.exports = router;
