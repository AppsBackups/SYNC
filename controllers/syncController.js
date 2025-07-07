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
    // ✅ Step 1: Get paired device IDs
    const pairedDeviceIds = await getPairedDeviceIds(deviceId);

    // ✅ Step 2: Push - Apply incoming changes from client
    for (const table of tableList) {
      if (Array.isArray(changes?.[table])) {
        const ids = [];

        for (const record of changes[table]) {
          record.last_modified = record.last_modified || new Date().toISOString();
          record.device_id = deviceId;
          const updated = await upsertRecord(table, record);
          if (updated) ids.push(updated.global_id);
        }

        await logSync(deviceId, "push", table, ids);
      }
    }

    // ✅ Step 3: Pull - Get new records from paired devices since last sync
    if (pairedDeviceIds.length > 0) {
      for (const table of tableList) {
        const rows = await getRecordsSinceFromDevices(table, lastSyncTimestamp, pairedDeviceIds);
        if (rows.length > 0) {
          pullChanges[table] = rows;
          const ids = rows.map(r => r.global_id);
          await logSync(deviceId, "pull", table, ids);
        }
      }
    }

    // ✅ Step 4: Return current timestamp + pulled changes
    res.status(200).json({
      currentServerTimestamp: new Date().toISOString(),
      changes: pullChanges
    });
  } catch (err) {
    console.error("❌ syncData error:", err);
    res.status(500).json({ error: "Failed to sync." });
  }
};
