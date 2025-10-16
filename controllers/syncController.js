

const {
  upsertRecord,
  getRecordsSinceFromDevices,
  logSync,
  getPairedDeviceIds,
  getCurrentSyncToken,
  safeUpsertRecord
} = require("../models/syncModel");

const pool = require("../config/db");
const admin = require("../config/firebase");

const tableList = [
  "User", "Item", "ItemGroup", "Customer", "CustomerGroup",
  "VAT", "TransactionStatus", "Transactionn", "TransactionPosition",
  "discount_rules", "Barcode", "ItemGroupToDeliveryType", "DeliveryType",
  "Salutation", "Setting", "PaymentType", "PSPSetting", "error_logs",
  "debug_logs", "Location", "Tables", "Reservations", "Orders",
  "OrderItems", "MergedTables"
];

const tableListpull = [
  "User", "Item", "ItemGroup", "Customer", "CustomerGroup",
  "VAT", "TransactionStatus", "TransactionPosition",
  "discount_rules", "Barcode", "ItemGroupToDeliveryType", "DeliveryType",
  "Salutation", "Setting", "PaymentType", "PSPSetting",
  "Location", "Tables", "Reservations", "Orders",
  "OrderItems", "MergedTables"
];


exports.syncData = async (req, res) => {
  const { deviceId, changes, tenantId, fcmtoken, devicename } = req.body;
  const sinceToken = req.body.since_token ?? req.body.sync_token;

  if (!deviceId || !tenantId || sinceToken === undefined || sinceToken === null) {
    return res.status(400).json({ error: "Missing required fields: deviceId, tenantId, or sync_token" });
  }

  console.log("🔹 [SYNC STARTED]", { deviceId, tenantId, sinceToken });

  // Step 0️⃣ — Save or update device info
  await pool.query(`
    INSERT INTO devices (deviceId, fcmtoken, tenantId, devicename)
    VALUES ($1, $2, $3, $4)
    ON CONFLICT (deviceId)
    DO UPDATE SET
      fcmtoken = EXCLUDED.fcmtoken,
      tenantId = EXCLUDED.tenantId,
      devicename = EXCLUDED.devicename,
      updated_at = NOW()
  `, [deviceId, fcmtoken, tenantId, devicename]);

  // Step 1️⃣ — Validate tenant plan
  const planResult = await pool.query(
    `SELECT purchase_date FROM user_plans WHERE teanut = $1 ORDER BY purchase_date DESC LIMIT 1`,
    [tenantId]
  );

  if (!planResult.rows.length) {
    return res.status(403).json({ message: "No active plan found for this tenant." });
  }

  const purchaseDate = new Date(planResult.rows[0].purchase_date);
  const expiryDate = new Date(purchaseDate);
  expiryDate.setMonth(expiryDate.getMonth() + 1);

  if (new Date() > expiryDate) {
    return res.status(403).json({ message: "Plan expired. Please renew to continue syncing." });
  }

  const pullChanges = {};
  let hasChangesToPush = false;

  try {
    // Step 2️⃣ — Get paired devices
    const pairedDeviceIds = await getPairedDeviceIds(deviceId,tenantId);
    const otherPairedDevices = pairedDeviceIds.filter(id => id !== deviceId);

    // if (otherPairedDevices.length === 0) {
    //   return res.status(200).json({
    //     message: "No paired devices found. Sync skipped.",
    //     sync_token: sinceToken,
    //     changes: {}
    //   });
    // }

    // Step 3️⃣ — Push local changes from this device
    for (const table of tableList) {
      const incomingRecords = changes?.[table];
      if (!Array.isArray(incomingRecords) || incomingRecords.length === 0) continue;

      hasChangesToPush = true;
      const updatedGlobalIds = [];

      for (const record of incomingRecords) {
        try {
          
          const updated = await safeUpsertRecord(table, record, tenantId, deviceId);
          if (updated?.global_id) updatedGlobalIds.push(updated.global_id);
        } catch (err) {
          console.error(`❌ Error in ${table}:`, err.message);
        }
      }

      await logSync(deviceId, tenantId, "push");
      console.log(`📤 ${updatedGlobalIds.length} records pushed to ${table}`);
    }

    //pull
    let hasChangesToPull = false;

    for (const table of tableListpull) {
      const rows = await getRecordsSinceFromDevices(table, sinceToken, tenantId, deviceId);
      if (rows.length > 0) {
        pullChanges[table] = rows;
        hasChangesToPull = true;

        await logSync(deviceId, tenantId, "pull");
        console.log(`📥 Pulled ${rows.length} records from ${table}`);
      }
    }


let newSyncToken = sinceToken;


  

if (hasChangesToPush) {
  const { rows: dbRows } = await pool.query(`SELECT current_token FROM sync_token LIMIT 1`);
let dbToken = dbRows[0]?.current_token ?? 0;
newSyncToken = dbToken;

} else if (hasChangesToPull) {
  // ✅ Only pull happened
  const { rows: dbRows } = await pool.query(`SELECT current_token FROM sync_token LIMIT 1`);
let dbToken = dbRows[0]?.current_token ?? 0;
  let finalToken = dbToken;

  const { rows } = await pool.query(`
    UPDATE sync_token 
    SET current_token = current_token + 1 
    RETURNING current_token;
  `);
  finalToken = rows[0].current_token;
  console.log("✅ Pull detected — incremented global token:", finalToken);
  newSyncToken = finalToken;

} else {

  // ✅ Only pull happened
  console.log("⚪ No push or pull — global token unchanged:", newSyncToken);
}




    // Step 6️⃣ — Send FCM notifications (excluding sender)
    // if (hasChangesToPush) {
    //   const fcmResult = await pool.query(
    //     `SELECT fcmtoken FROM devices WHERE tenantId = $1 AND deviceId != $2 AND fcmtoken IS NOT NULL`,
    //     [tenantId, deviceId]
    //   );

    //   const tokens = fcmResult.rows.map(r => r.fcmtoken);
    //   // console.log("🚀 Sending FCM to devices:", tokens, "excluding:", deviceId);

    //   if (tokens.length > 0) {
    //     const message = {
    //       data: { type: "SYNC_TRIGGER", triggeredBy: deviceId }
    //     };
    //     await Promise.all(tokens.map(token => admin.messaging().send({ ...message, token })));
    //     console.log(`📲 Sent sync notifications to ${tokens.length} devices`);
    //   }
    // }


    if (hasChangesToPush) {
  const fcmResult = await pool.query(
    `SELECT fcmtoken FROM devices WHERE tenantId = $1 AND deviceId != $2 AND fcmtoken IS NOT NULL`,
    [tenantId, deviceId]
  );

  const tokens = fcmResult.rows.map(r => r.fcmtoken);

  if (tokens.length > 0) {
    const message = {
      data: { type: "SYNC_TRIGGER", triggeredBy: deviceId }
    };

    // Safely send to all tokens
    const sendPromises = tokens.map(async (token) => {
      try {
        // Basic token validation
        if (!token || token.length < 100) {
          console.warn(`⚠️ Skipping invalid FCM token: ${token}`);
          return;
        }

        await admin.messaging().send({ ...message, token });
      } catch (err) {
        // Handle invalid or expired tokens gracefully
        if (
          err.code === "messaging/invalid-argument" ||
          err.code === "messaging/registration-token-not-registered"
        ) {
          console.warn(`❌ Removing invalid FCM token: ${token}`);
          // Optional: cleanup token in DB
          try {
            await pool.query(`UPDATE devices SET fcmtoken = NULL WHERE fcmtoken = $1`, [token]);
          } catch (dbErr) {
            console.error("⚠️ Failed to remove invalid token from DB:", dbErr.message);
          }
        } else {
          console.error(`⚠️ Failed to send FCM to ${token}:`, err.message);
        }
      }
    });

    // Continue even if some sends fail
    await Promise.allSettled(sendPromises);
    console.log(`📲 FCM notifications attempted for ${tokens.length} devices`);
  }
}

    console.log("✅ [SYNC COMPLETED]");

    // Step 7️⃣ — Send response
    return res.status(200).json({
      sync_token: newSyncToken,
      changes: pullChanges
    });

  } catch (err) {
    console.error("❌ syncData error:", err);
    return res.status(500).json({ error: "Sync failed. Check server logs." });
  }
};



// =============================================================
// 📋 GET SYNC LOGS
// =============================================================


exports.getSyncLogs = async (req, res) => {
  const { deviceId, tenantId, direction, startDate, endDate } = req.query;

  const filters = [];
  const values = [];

  if (deviceId) {
    filters.push(`device_id = $${values.length + 1}`);
    values.push(deviceId);
  }
  if (tenantId) {
    filters.push(`tenant = $${values.length + 1}`);
    values.push(tenantId);
  }
  if (direction) {
    filters.push(`direction = $${values.length + 1}`);
    values.push(direction);
  }
  if (startDate) {
    filters.push(`synced_at >= $${values.length + 1}`);
    values.push(startDate);
  }
  if (endDate) {
    filters.push(`synced_at <= $${values.length + 1}`);
    values.push(endDate);
  }

  const whereClause = filters.length > 0 ? `WHERE ${filters.join(" AND ")}` : "";

  try {
    const result = await pool.query(
      `SELECT id, device_id, tenant, direction, table_name, synced_at FROM sync_log ${whereClause} ORDER BY synced_at DESC`,
      values
    );
    res.status(200).json({ success: true, data: result.rows });
  } catch (err) {
    console.error("❌ Error fetching sync logs:", err.message);
    res.status(500).json({ success: false, error: "Failed to fetch sync logs" });
  }
};

// =============================================================
// 🔘 MANUAL SYNC TRIGGER
// =============================================================
exports.mannualSync = async (req, res) => {
  const { deviceId } = req.body;

  try {
    const result = await pool.query(
      "SELECT fcmtoken FROM devices WHERE deviceid = $1",
      [deviceId]
    );

    if (!result.rows.length) {
      return res.status(404).json({ error: "Device not found" });
    }

    const deviceToken = result.rows[0].fcmtoken;
    const message = {
      token: deviceToken,
      notification: {
        title: "Manual Sync",
        body: "Sync request triggered manually."
      },
      data: { type: "SYNC_REQUEST", deviceId }
    };

    const response = await admin.messaging().send(message);
    console.log("✅ Manual sync notification sent:", response);

    return res.json({ success: true, messageId: response });
  } catch (err) {
    console.error("❌ Manual sync failed:", err);
    return res.status(500).json({ error: "Failed to send sync notification" });
  }
};

// =============================================================
// 📱 GET DEVICES LIST
// =============================================================
exports.devices = async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM devices ORDER BY updated_at DESC");
    res.status(200).json({ success: true, devices: result.rows });
  } catch (err) {
    console.error("❌ Error fetching devices:", err.message);
    res.status(500).json({ success: false, error: "Failed to fetch devices" });
  }
};
