const express = require("express");
const router = express.Router();

const { getSyncLogs , mannualSync , devices} = require("../controllers/syncController");
const { syncData } = require("../controllers/syncer")
// router.post("/sync", syncData);


router.post("/sync", syncData);

router.get("/logs", getSyncLogs);
router.post("/mannual_sync",mannualSync);
router.get("/devices", devices);

module.exports = router;
