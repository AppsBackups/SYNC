const {
  upsertRecord,
  getRecordsSinceFromDevices,
  logSync,
  getPairedDeviceIds,
  getCurrentSyncToken
} = require("../models/syncModel");

const pool = require("../config/db");

const tableList = [
  "User", "Item", "ItemGroup", "Customer", "CustomerGroup",
  "VAT", "TransactionStatus", "Transactionn", "TransactionPosition", "discount_rules","Barcode","ItemGroupToDeliveryType","DeliveryType","Salutation", "Setting", "PaymentType","PSPSetting"
];

const tableListpull = [
  "User", "Item", "ItemGroup", "Customer", "CustomerGroup",
  "VAT", "TransactionStatus", "TransactionPosition", "discount_rules","Barcode","ItemGroupToDeliveryType","DeliveryType","Salutation", "Setting", "PaymentType","PSPSetting"
];

exports.syncData = async (req, res) => {
  const { deviceId, changes ,tenantId } = req.body;

  // Support both `since_token` and `sync_token`
  const sinceToken = req.body.since_token ?? req.body.sync_token;

  console.log("🔄 Sync request received");
  console.log("🆔 Device ID:", deviceId);
  console.log("🔢 Since Sync Token:", sinceToken);

  // Validate input
  if (!deviceId || !tenantId || sinceToken === undefined || sinceToken === null) {
    return res.status(400).json({
      error: "Missing required field: deviceId , teanantId or sync_token"
    });
  }

  const pullChanges = {};

  try {
    // Step 1: Get paired device IDs
    const pairedDeviceIds = await getPairedDeviceIds(deviceId, tenantId);
    console.log("📡 Paired devices:", pairedDeviceIds);

    // Step 2: Push - Save incoming changes to DB
    for (const table of tableList) {
      const incomingRecords = changes?.[table];

      if (Array.isArray(incomingRecords) && incomingRecords.length > 0) {
        const updatedGlobalIds = [];

        for (const record of incomingRecords) {
          try {
            // Remove client-sent sync_token/device_id for safety
            delete record.sync_token;
            record.device_id = deviceId;

            const updated = await upsertRecord(table, record);

            if (updated?.global_id) {
              updatedGlobalIds.push(updated.global_id);
            }
          } catch (err) {
            console.error(`❌ Error inserting/updating ${table}:`, err.message, record);
          }
        }

        await logSync(deviceId, "push", table, updatedGlobalIds);
        console.log(`📤 Pushed ${updatedGlobalIds.length} records to ${table}`);
      }
    }

    // Step 3: Pull - Get new data from other devices
    if (pairedDeviceIds.length > 0) {
      for (const table of tableListpull) {
        try {
          const rows = await getRecordsSinceFromDevices(table, sinceToken, pairedDeviceIds);
          if (rows.length > 0) {
            pullChanges[table] = rows;
            const pulledIds = rows.map(r => r.global_id);
            await logSync(deviceId, "pull", table, pulledIds);
            console.log(`📥 Pulled ${pulledIds.length} records from ${table}`);
          }
        } catch (err) {
          console.error(`❌ Error pulling ${table}:`, err.message);
        }
      }
    }

    // Step 4: Return new sync_token
    const newSyncToken = await getCurrentSyncToken();

    console.log("✅ Sync complete");
    return res.status(200).json({
      sync_token: newSyncToken,
      changes: pullChanges
    });

  } catch (err) {
    console.error("❌ syncData error:", err);
    return res.status(500).json({
      error: "Sync failed. Check server logs."
    });
  }
};




exports.getSyncLogs = async (req, res) => {
  const { deviceId, direction, startDate, endDate } = req.query;

  let filters = [];
  let values = [];

  if (deviceId) {
    values.push(deviceId);
    filters.push(`device_id = $${values.length}`);
  }

  if (direction) {
    values.push(direction);
    filters.push(`direction = $${values.length}`);
  }

  if (startDate) {
    values.push(startDate);
    filters.push(`synced_at >= $${values.length}`);
  }

  if (endDate) {
    values.push(endDate);
    filters.push(`synced_at <= $${values.length}`);
  }

  const whereClause = filters.length > 0 ? `WHERE ${filters.join(" AND ")}` : "";

  const query = `
    SELECT id, device_id, direction, table_name, synced_at, record_ids
    FROM sync_logs
    ${whereClause}
    ORDER BY synced_at DESC
    LIMIT 100
  `;

  try {
    const result = await pool.query(query, values);
    res.status(200).json({ success: true, data: result.rows });
  } catch (err) {
    console.error("❌ Error fetching sync logs:", err.message);
    res.status(500).json({ success: false, error: "Failed to fetch sync logs" });
  }
};
