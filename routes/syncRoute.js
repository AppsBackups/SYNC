const express = require("express");
const router = express.Router();

const { syncData ,getSyncLogs } = require("../controllers/syncController");

router.post("/sync", syncData);

router.get("/logs", getSyncLogs);

module.exports = router;
