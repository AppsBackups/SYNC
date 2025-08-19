const express = require("express");
const router = express.Router();
const tableController = require("../controllers/tableController");

// Routes
router.get("/tables", tableController.listTables);
router.get("/tables/:name", tableController.getTable);

module.exports = router;
