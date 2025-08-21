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



// exports.getParkedTransactions = async (req, res) => {
//   try {
//     const result = await pool.query(
//       `SELECT * FROM "Transactionn" WHERE status = 'Parked'`
//     );

//     return res.status(200).json({
//       success: true,
//       message: "Parked transactions fetched successfully",
//       data: result.rows
//     });
//   } catch (err) {
//     console.error('Fetch Parked error:', err);
//     return res.status(500).json({ error: 'Failed to fetch parked transactions' });
//   }
// };



exports.getParkedTransactions = async (req, res) => {
  try {
    // Step 1: Get all parked transactions
    const transactionsResult = await pool.query(
      `SELECT * FROM "Transactionn" WHERE status = 'Parked'`
    );
    const transactions = transactionsResult.rows;

    if (transactions.length === 0) {
      return res.status(200).json({
        success: true,
        message: "No parked transactions found",
        Transactions: []
      });
    }

    // ✅ FIXED: Use correct field name — recordID
    const recordIds = transactions.map(t => t.recordID);

    

    // Step 2: Fetch all positions where transactionId matches any recordID
    const positionsResult = await pool.query(
      `SELECT * FROM "TransactionPosition" WHERE "transactionId" = ANY($1::int[])`,
      [recordIds]
    );
    const positions = positionsResult.rows;

    // Debug
    

    // Step 3: Map positions to their parent transactions
    const transactionMap = {};
    for (const tx of transactions) {
      transactionMap[tx.recordID] = { ...tx, positions: [] };
    }

    for (const pos of positions) {
      const txId = pos.transactionId; // Ensure this matches your DB column
      if (transactionMap[txId]) {
        transactionMap[txId].positions.push(pos);
      }
    }

    const result = Object.values(transactionMap);

    return res.status(200).json({
      success: true,
      message: "Parked transactions with positions fetched successfully",
      Transactions: result
    });
  } catch (err) {
    console.error('❌ Fetch Parked error:', err);
    return res.status(500).json({ error: 'Failed to fetch parked transactions' });
  }
};




exports.getLogs = async (req, res) => {
  const { device_id } = req.params;

  try {
    const result = await pool.query(
      `SELECT * FROM "debug_logs" WHERE device_id = $1 `,
      [device_id]
    );

    return res.json(result.rows);
  } catch (err) {
    console.error('Error fetching logs:', err);
    return res.status(500).json({ error: 'Failed to fetch logs' });
  }
};


