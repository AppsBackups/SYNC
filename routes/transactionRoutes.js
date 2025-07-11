const express = require('express');
const router = express.Router();
const controller = require('../controllers/transactionController');

router.post('/transactions/:global_id/lock', controller.lockTransaction);
router.post('/transactions/:global_id/complete', controller.completeTransaction);
router.get('/transactions/sync', controller.getModifiedTransactions);

router.get("/transactions/parked", controller.getParkedTransactions);

module.exports = router;
