const { upsertRecord, getRecordsSince, logSync } = require("../models/syncModel");

const tableList = [
  "User", "Item", "ItemGroup", "Customer", "CustomerGroup",
  "VAT", "TransactionStatus", "Transactionn", "TransactionPosition", "discount_rules"
];

exports.syncData = async (req, res) => {
  const { deviceId, lastSyncTimestamp, changes } = req.body;
  const pullChanges = {};

  try {
    // 1. PUSH: apply incoming changes from this device
    for (const table of tableList) {
      if (Array.isArray(changes[table])) {
        const ids = [];
        for (const record of changes[table]) {
          await upsertRecord(table, record);
          ids.push(record.global_id);
        }
        await logSync(deviceId, "push", table, ids);
      }
    }

    // 2. PULL: get all data modified after lastSyncTimestamp
    for (const table of tableList) {
      const rows = await getRecordsSince(table, lastSyncTimestamp);
      if (rows.length > 0) {
        pullChanges[table] = rows;
        const ids = rows.map(r => r.global_id);
        await logSync(deviceId, "pull", table, ids);
      }
    }

    // 3. Respond with new server timestamp
    const currentServerTimestamp = new Date().toISOString();
    res.status(200).json({ currentServerTimestamp, changes: pullChanges });
  } catch (err) {
    console.error("❌ syncData error:", err);
    res.status(500).json({ error: "Failed to sync" });
  }
};
