const express = require('express');
const router = express.Router();
const deviceController = require('../controllers/deviceController');

router.post('/getQRCode', deviceController.getQRCode);
router.post('/registerNewDevice', deviceController.registerNewDevice);
router.get('/pairedDevices/:deviceId', deviceController.getPairedDevices);

module.exports = router;
