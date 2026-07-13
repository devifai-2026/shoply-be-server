const router = require('express').Router();
const ctrl   = require('../controllers/platform.controller');
const keystore = require('../controllers/keystore.controller');
const { protectOwner } = require('../middleware/ownerAuth');
const { uploadTenantLogo } = require('../middleware/upload');

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
router.post('/tenants/logo-upload', uploadTenantLogo, ctrl.uploadTenantLogo);
router.get('/tenants/:slug',    ctrl.getTenant);
router.patch('/tenants/:slug/suspend',    ctrl.suspendTenant);
router.patch('/tenants/:slug/reactivate', ctrl.reactivateTenant);
router.patch('/tenants/:slug/addons/:addonKey', ctrl.setAddon);
router.delete('/tenants/:slug',           ctrl.deleteTenant);
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

// AI product review prompt (platform-wide, owner-only)
router.get('/ai-prompt',        ctrl.getAiPrompt);
router.put('/ai-prompt',        ctrl.updateAiPrompt);
router.post('/ai-prompt/test',  ctrl.testAiPrompt);

module.exports = router;
