const router             = require('express').Router();
const ctrl               = require('../controllers/storefront.controller');
const { protectCustomer } = require('../middleware/customerAuth');

// Products
router.get('/products',                             ctrl.listProducts);
router.get('/products/:id',                         ctrl.getProduct);
router.get('/products/:id/reviews',                 ctrl.getProductReviews);
router.post('/products/:id/reviews', protectCustomer, ctrl.submitReview);

// Categories & Brands
router.get('/categories',            ctrl.listCategories);
router.get('/brands',                ctrl.listBrands);

// Vendor storefront pages
router.get('/vendors/:slug',         ctrl.getVendorStore);

// Flash Sale
router.get('/flash-sales/active',    ctrl.getActiveFlashSale);

// Offers
router.get('/offers',                require('../controllers/offer.controller').getActiveOffers);
router.get('/offers/:id',            require('../controllers/offer.controller').getActiveOffer);
router.post('/offers/calculate',     require('../controllers/offer.controller').calculateOfferDiscount);

// Sponsored slots (admin-curated featured placement, no vendor payment flow)
router.get('/sponsored-slots',       require('../controllers/sponsoredSlot.controller').getActiveSlots);

// Appearance
router.get('/appearance',            ctrl.getAppearance);

// Payment Gateways (active only, no secrets)
router.get('/payment-gateways',      require('../controllers/payment.controller').getStorefrontGateways);

// Coupons
router.post('/coupons/validate',     ctrl.validateCoupon);

module.exports = router;
