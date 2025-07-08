const express = require("express");
const router = express.Router();
const { validateRequest } = require('../middleware/validation');
const { syncData } = require("../controllers/syncController");

router.post("/sync", syncData);

module.exports = router;
