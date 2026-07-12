const router = require('express').Router();
const ctrl   = require('../controllers/platform.controller');
const keystore = require('../controllers/keystore.controller');
const { protectOwner } = require('../middleware/ownerAuth');

// Public: owner login + CI-secret endpoints (build callback + keystore material)
router.post('/login', ctrl.login);
router.post('/builds/:id/callback', ctrl.buildCallback);
router.get('/keystore/material', keystore.material);

// Everything else requires an owner token
router.use(protectOwner);

router.get('/overview',  ctrl.overview);
router.get('/metrics',   ctrl.metrics);
router.get('/analytics', ctrl.analytics);

router.get('/tenants',          ctrl.listTenants);
router.post('/tenants',         ctrl.createTenant);
router.get('/tenants/:slug',    ctrl.getTenant);
router.patch('/tenants/:slug/suspend',    ctrl.suspendTenant);
router.patch('/tenants/:slug/reactivate', ctrl.reactivateTenant);
router.put('/tenants/:slug/secrets',      ctrl.rotateSecrets);
router.get('/tenants/:slug/admin-credentials',         ctrl.getAdminCredentials);
router.post('/tenants/:slug/admin-credentials/rotate', ctrl.rotateAdminCredentials);
router.post('/tenants/:slug/builds',      ctrl.queueBuild);

router.get('/builds', ctrl.listBuilds);
router.get('/builds/:id/download', ctrl.buildDownload);

// Platform Android signing keystore
router.get('/keystore',          keystore.get);
router.post('/keystore/upload',  keystore.upload);
router.post('/keystore/generate', keystore.generate);

module.exports = router;
