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

  console.log("🔄 Sync request received");
  console.log("🆔 Device ID:", deviceId);
  console.log("⏱️ Last Sync Timestamp:", lastSyncTimestamp);

  const pullChanges = {};

  if (!deviceId || !lastSyncTimestamp) {
    return res.status(400).json({
      error: "Missing deviceId or lastSyncTimestamp"
    });
  }


  try {
    // Step 1: Get paired device IDs
    const pairedDeviceIds = await getPairedDeviceIds(deviceId);
    console.log("📡 Paired device IDs:", pairedDeviceIds);

    // Step 2: Push - Apply incoming changes
    for (const table of tableList) {
      const incoming = changes?.[table];

      if (Array.isArray(incoming) && incoming.length > 0) {
        const updatedIds = [];

        for (const record of incoming) {
          try {
            record.last_modified = record.last_modified || new Date().toISOString();
            record.device_id = deviceId;

            const updated = await upsertRecord(table, record);

            if (updated && updated.global_id) {
              updatedIds.push(updated.global_id);
            }
          } catch (err) {
            console.error(`❌ Error updating ${table}:`, err.message, record);
          }
        }

        await logSync(deviceId, "push", table, updatedIds);
        console.log(`📤 Pushed to ${table}:`, updatedIds.length, "records");
      }
    }

    // Step 3: Pull - Get changes from paired devices
    if (pairedDeviceIds.length > 0) {
      for (const table of tableList) {
        try {
          const rows = await getRecordsSinceFromDevices(table, lastSyncTimestamp, pairedDeviceIds);
          if (rows.length > 0) {
            pullChanges[table] = rows;
            const rowIds = rows.map(r => r.global_id);
            await logSync(deviceId, "pull", table, rowIds);
            console.log(`📥 Pulled from ${table}:`, rowIds.length, "records");
          }
        } catch (err) {
          console.error(`❌ Error pulling from ${table}:`, err.message);
        }
      }
    }

    // Step 4: Return response
    const currentTimestamp = new Date().toISOString();

    console.log("✅ Sync complete");
    return res.status(200).json({
      currentServerTimestamp: currentTimestamp,
      changes: pullChanges
    });

  } catch (err) {
    console.error("❌ syncData error:", err);
    return res.status(500).json({
      error: "Sync failed. Check server logs."
    });
  }
};
