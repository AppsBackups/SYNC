const express = require("express");
const router = express.Router();

const {syncData, getSyncLogs , mannualSync , devices} = require("../controllers/syncController");


router.post("/sync", syncData);

router.get("/logs", getSyncLogs);
router.post("/mannual_sync",mannualSync);
router.get("/devices", devices);

module.exports = router;
