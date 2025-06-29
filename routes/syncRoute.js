const express = require("express");
const router = express.Router();
const { validateRequest } = require('../middleware/validation');
const { syncData } = require("../controllers/syncController");

router.post("/sync",  validateRequest,syncData);

module.exports = router;
