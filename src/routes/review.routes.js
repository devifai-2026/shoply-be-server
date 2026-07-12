const router = require('express').Router();
const ctrl   = require('../controllers/review.controller');
const { protect } = require('../middleware/auth');
const { uploadReviewImages } = require('../middleware/upload');

router.use(protect);

router.get('/stats',          ctrl.getStats);
router.get('/settings',       ctrl.getSettings);
router.put('/settings',       ctrl.updateSettings);
router.get('/',               ctrl.list);
router.post('/',              uploadReviewImages, ctrl.create);
router.get('/:id',            ctrl.getOne);
router.patch('/:id/status',   ctrl.updateStatus);
router.delete('/:id',         ctrl.remove);

module.exports = router;
