const express = require("express");
const router = express.Router();
const receiptController = require("../controllers/receiptController");

router.post("/receipts", receiptController.generateReceipt);

module.exports = router;
