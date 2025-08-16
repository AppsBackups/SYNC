const express = require('express');
const router = express.Router();
const pairingController = require('../controllers/pairingController');

router.post('/initiate', pairingController.initiatePairing);
router.post('/request', pairingController.requestPairing);
router.post('/confirm', pairingController.confirmPairing);
router.get('/paired/:deviceId', pairingController.getPairedDevices);
router.post('/unpair', pairingController.unpairDevices);

router.get('/pair' , pairingController.paired);
router.get('/paired-devices/:teanutId',pairingController.gettenautbasedpairs)

module.exports = router;
