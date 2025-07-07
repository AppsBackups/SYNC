const {
  upsertRecord,
  getRecordsSinceFromDevices,
  logSync,
  getPairedDeviceIds
} = require("../models/syncModel");

const tableList = [
  "User", "Item", "ItemGroup", "Customer", "CustomerGroup",
  "VAT", "TransactionStatus", "Transactionn", "TransactionPosition", "discount_rules"
];

exports.syncData = async (req, res) => {
  const { deviceId, lastSyncTimestamp, changes } = req.body;
  const pullChanges = {};

  if (!deviceId || !lastSyncTimestamp) {
    return res.status(400).json({ error: "deviceId and lastSyncTimestamp are required." });
  }

  try {
    // ✅ 1. Get all devices paired with the current device
    const pairedDeviceIds = await getPairedDeviceIds(deviceId);

    // ✅ 2. Push changes from this device to server
    for (const table of tableList) {
      if (Array.isArray(changes?.[table])) {
        const ids = [];

        for (const record of changes[table]) {
          // Ensure timestamp is valid ISO string
          record.last_modified = record.last_modified || new Date().toISOString();
          record.device_id = deviceId; // track the source of the record
          await upsertRecord(table, record);
          ids.push(record.global_id);
        }

        // Log pushed changes
        await logSync(deviceId, "push", table, ids);
      }
    }

    // ✅ 3. Pull records from all paired devices
    for (const table of tableList) {
      const rows = await getRecordsSinceFromDevices(table, lastSyncTimestamp, pairedDeviceIds);
      if (rows.length > 0) {
        pullChanges[table] = rows;
        const ids = rows.map(r => r.global_id);
        await logSync(deviceId, "pull", table, ids);
      }
    }

    // ✅ 4. Return current server time and new changes
    res.status(200).json({
      currentServerTimestamp: new Date().toISOString(),
      changes: pullChanges
    });
  } catch (err) {
    console.error("❌ syncData error:", err);
    res.status(500).json({ error: "Failed to sync." });
  }
};
