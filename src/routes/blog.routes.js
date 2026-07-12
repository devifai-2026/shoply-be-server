const router = require('express').Router();
const ctrl   = require('../controllers/blog.controller');
const { protect } = require('../middleware/auth');
const { uploadBlogCover } = require('../middleware/upload');

// Public routes (no auth required)
router.get('/public',     ctrl.listPublic);
router.get('/public/:id', ctrl.getOnePublic);

// Admin-protected routes
router.use(protect);

router.get('/',       ctrl.list);
router.post('/',      uploadBlogCover, ctrl.create);
router.get('/:id',    ctrl.getOne);
router.put('/:id',    uploadBlogCover, ctrl.update);
router.delete('/:id', ctrl.remove);

module.exports = router;
