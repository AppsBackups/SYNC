const { upsertRecord, getRecordsSince, logSync } = require("../models/syncModel");

const tableList = [
  "User", "Item", "ItemGroup", "Customer", "CustomerGroup",
  "VAT", "TransactionStatus", "Transactionn", "TransactionPosition", "discount_rules"
];

exports.syncData = async (req, res) => {
  const { deviceId, lastSyncTimestamp, changes } = req.body;
  const updatedIds = {};
  const pullChanges = {};

  try {
    // PUSH changes
    for (const table of tableList) {
      if (changes[table]) {
        updatedIds[table] = [];
        for (const record of changes[table]) {
          await upsertRecord(table, record);
          updatedIds[table].push(record.global_id);
        }
        await logSync(deviceId, "push", table, updatedIds[table]);
      }
    }

    // PULL changes (based on timestamp only)
    for (const table of tableList) {
      const rows = await getRecordsSince(table, lastSyncTimestamp);
      console.log(`📥 Pulled ${rows.length} rows from ${table}`);
      if (rows.length > 0) {
        pullChanges[table] = rows;
        const pulledIds = rows.map(row => row.global_id);
        await logSync(deviceId, "pull", table, pulledIds);
      }
    }

    const currentServerTimestamp = new Date().toISOString();

    res.status(200).json({
      currentServerTimestamp,
      changes: pullChanges,
    });
  } catch (error) {
    console.error("❌ Error in syncData:", error);
    res.status(500).json({ error: "Failed to sync data" });
  }
};
