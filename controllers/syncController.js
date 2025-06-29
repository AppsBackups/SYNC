const { upsertRecord, getRecordsSince } = require("../models/syncModel");

const tableList = [
  "users", "items", "item_groups", "customers", "customer_groups",
  "vat", "transaction_status", "transactionn", "transaction_position", "discount_rules"
];


exports.syncData = async (req, res) => {
  const { deviceId, lastSyncTimestamp, changes } = req.body;
  const updatedIds = {};

  for (const table of tableList) {
    if (changes[table]) {
      updatedIds[table] = [];
      for (const record of changes[table]) {
        updatedIds[table].push(record.global_id);
        await upsertRecord(table, record);
      }
    }
  }

  const pullChanges = {};
  for (const table of tableList) {
    const rows = await getRecordsSince(table, lastSyncTimestamp, updatedIds[table] || []);
    if (rows.length > 0) {
      pullChanges[table] = rows;
    }
  }

  const currentServerTimestamp = new Date().toISOString();

  res.status(200).json({
    currentServerTimestamp,
    changes: pullChanges,
  });
};
