const router = require('express').Router();

// Customer-facing routes (no admin auth required)
router.use('/storefront',          require('./storefront.routes'));
router.use('/track',               require('./tracking.routes'));

// Public shipping rate (no auth — used by checkout before order creation)
router.post('/storefront/shipping/calculate-rate',
  require('../controllers/shipping.controller').calculateRate);

router.use('/customer/orders',     require('./customerOrder.routes'));
router.use('/customer/payments',   require('./customerPayment.routes'));
router.use('/customer/cart',       require('./customerCart.routes'));
router.use('/customer/wishlist',   require('./customerWishlist.routes'));
router.use('/customer/push',       require('./customerPush.routes'));
router.use('/customer/otp',        require('./otp.routes'));
router.use('/customer',            require('./customerAuth.routes'));

// Vendor portal (marketplace sellers — separate auth tier)
router.use('/vendor',              require('./vendor.routes'));

// Admin routes
router.use('/auth',               require('./auth.routes'));
router.use('/dashboard',          require('./dashboard.routes'));
router.use('/analytics',          require('./analytics.routes'));
router.use('/visitors',           require('./visitors.routes'));
router.use('/products',           require('./product.routes'));
router.use('/categories',         require('./category.routes'));
router.use('/brands',             require('./brand.routes'));
router.use('/inventory',          require('./inventory.routes'));
router.use('/orders',             require('./order.routes'));
router.use('/customers',          require('./customer.routes'));
router.use('/vendors',            require('./vendorAdmin.routes'));
router.use('/withdrawals',        require('./withdrawal.routes'));
router.use('/coupons',            require('./coupon.routes'));
router.use('/flash-sales',        require('./flashSale.routes'));
router.use('/offers',             require('./offer.routes'));
router.use('/push-notifications', require('./pushNotification.routes'));
router.use('/appearance',         require('./appearance.routes'));
router.use('/settings',           require('./settings.routes'));
router.use('/payments',           require('./payment.routes'));
router.use('/shipping',           require('./shipping.routes'));
router.use('/reviews',            require('./review.routes'));
router.use('/reports',            require('./report.routes'));
router.use('/notifications',      require('./notification.routes'));
router.use('/blogs',              require('./blog.routes'));

module.exports = router;
