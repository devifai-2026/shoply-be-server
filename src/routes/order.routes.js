const router = require('express').Router();
const ctrl   = require('../controllers/order.controller');
const { protect } = require('../middleware/auth');

router.use(protect);

router.get('/export',        ctrl.exportCSV);
router.get('/',              ctrl.list);
router.post('/',             ctrl.create);
router.get('/:id',           ctrl.getOne);
router.patch('/:id/status',  ctrl.updateStatus);
router.get('/:id/invoice',   ctrl.printInvoice);

module.exports = router;
