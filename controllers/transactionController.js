const pool = require('../config/db');

// Lock API
exports.lockTransaction = async (req, res) => {
  const { global_id } = req.params;
  const { deviceId } = req.body;

  try {
    const tx = await pool.query(
      `SELECT status FROM "Transactionn" WHERE global_id = $1`,
      [global_id]
    );

    if (tx.rowCount === 0) return res.status(404).json({ error: "Transaction not found" });

    if (tx.rows[0].status !== 'Parked') {
      return res.status(409).json({ error: "Transaction not PARKED" });
    }

    // Mark as IN_PROGRESS (locked)
    await pool.query(
      `UPDATE "Transactionn" SET status = 'IN_PROGRESS' WHERE global_id = $1`,
      [global_id]
    );

    return res.status(200).json({ message: 'Transaction locked' });
  } catch (err) {
    console.error('Lock error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
};

// Complete API
exports.completeTransaction = async (req, res) => {
  const { global_id } = req.params;

  try {
    const tx = await pool.query(
      `UPDATE "Transactionn" SET status = 'Completed' WHERE global_id = $1 AND status = 'IN_PROGRESS'`,
      [global_id]
    );

    if (tx.rowCount === 0) {
      return res.status(409).json({ error: "Transaction must be IN_PROGRESS to complete" });
    }

    return res.status(200).json({ message: 'Transaction completed' });
  } catch (err) {
    console.error('Complete error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
};

// Sync API (pull changes)
exports.getModifiedTransactions = async (req, res) => {
  const { since } = req.query;

  try {
    const result = await pool.query(
      `SELECT * "Transactionn" WHERE last_modified > $1`,
      [since]
    );

    return res.json(result.rows);
  } catch (err) {
    console.error('Sync error:', err);
    return res.status(500).json({ error: 'Sync failed' });
  }
};
