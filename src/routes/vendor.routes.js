const router = require('express').Router();
const auth   = require('../controllers/vendorAuth.controller');
const portal = require('../controllers/vendorPortal.controller');
const { protectVendor, requireApproved } = require('../middleware/vendorAuth');
const { uploadProductImages } = require('../middleware/upload');

// ─── Public auth ──────────────────────────────────────────────────────────────
router.post('/auth/register', auth.register);
router.post('/auth/login',    auth.login);

// ─── Vendor portal (authenticated) ───────────────────────────────────────────
router.use(protectVendor);

router.get('/auth/me',    auth.me);
router.put('/profile',    auth.updateProfile);
router.put('/change-password', auth.changePassword);

router.get('/dashboard',  requireApproved, portal.dashboard);
router.get('/earnings',   requireApproved, portal.earnings);
router.get('/withdrawals',  requireApproved, portal.listWithdrawals);
router.post('/withdrawals', requireApproved, portal.requestWithdrawal);

router.post('/products/images', requireApproved, uploadProductImages, portal.uploadImages);
router.get('/products',        portal.listProducts);
router.post('/products',       requireApproved, portal.createProduct);
router.put('/products/:id',    portal.updateProduct);
router.delete('/products/:id', portal.deleteProduct);

router.get('/orders',              requireApproved, portal.listSubOrders);
router.get('/orders/:id',          requireApproved, portal.getSubOrder);
router.patch('/orders/:id/status', requireApproved, portal.updateSubOrderStatus);
router.get('/orders/:id/track',    requireApproved, portal.trackSubOrder);

module.exports = router;
