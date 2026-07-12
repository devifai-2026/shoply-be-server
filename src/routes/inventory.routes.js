const router = require('express').Router();
const ctrl   = require('../controllers/inventory.controller');
const { protect } = require('../middleware/auth');

router.use(protect);

router.get('/',                          ctrl.list);
router.get('/alerts',                    ctrl.getAlerts);
router.patch('/:productId/stock',        ctrl.updateStock);
router.post('/:productId/restock',       ctrl.restock);

module.exports = router;
