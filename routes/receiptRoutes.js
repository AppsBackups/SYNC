const express = require("express");
const router = express.Router();
const receiptController = require("../controllers/receiptController");
const pool = require("../config/db");

router.post("/receipts", receiptController.generateReceipt);



router.get('/paired-devices', async (req, res) => {
  try {
    const result = await pool.query(`SELECT * FROM paired_devices ORDER BY paired_at DESC`);
    res.json({ pairedDevices: result.rows });
  } catch (error) {
    console.error('Error fetching paired devices:', error);
    res.status(500).json({ error: 'Server error' });
  }
});


module.exports = router;
