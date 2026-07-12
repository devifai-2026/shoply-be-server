const router = require('express').Router();
const ctrl   = require('../controllers/customer.controller');
const { protect } = require('../middleware/auth');

router.use(protect);

router.get('/export',              ctrl.exportCSV);
router.get('/',                    ctrl.list);
router.get('/:id',                 ctrl.getOne);
router.patch('/:id/block',         ctrl.block);
router.patch('/:id/unblock',       ctrl.unblock);
router.post('/:id/addresses',      ctrl.addAddress);

module.exports = router;
