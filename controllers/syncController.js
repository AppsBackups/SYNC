// const {
//   upsertRecord,
//   getRecordsSinceFromDevices,
//   logSync,
//   getPairedDeviceIds,
//   getCurrentSyncToken,
//   safeUpsertRecord
// } = require("../models/syncModel");

// const pool = require("../config/db");
// const admin = require('../config/firebase');

// const tableList = [
//   "User", "Item", "ItemGroup", "Customer", "CustomerGroup",
//   "VAT", "TransactionStatus", "Transactionn", "TransactionPosition", "discount_rules","Barcode","ItemGroupToDeliveryType","DeliveryType","Salutation", "Setting", "PaymentType","PSPSetting","error_logs","debug_logs","Location","Tables" ,"Reservations" , "Orders" , "OrderItems" ,"MergedTables"
// ];

// const tableListpull = [
//   "User", "Item", "ItemGroup", "Customer", "CustomerGroup",
//   "VAT", "TransactionStatus", "TransactionPosition", "discount_rules","Barcode","ItemGroupToDeliveryType","DeliveryType","Salutation", "Setting", "PaymentType","PSPSetting" ,"Location","Tables" ,"Reservations" , "Orders" , "OrderItems" ,"MergedTables"
// ];



// exports.syncData = async (req, res) => {
//   const { deviceId, changes, tenantId, fcmtoken, devicename } = req.body;

//   // Step 0: Save or update device info
//   const saveQuery = `
//     INSERT INTO devices (deviceId, fcmtoken, tenantId, devicename)
//     VALUES ($1, $2, $3, $4)
//     ON CONFLICT (deviceId)
//     DO UPDATE SET
//       fcmtoken = EXCLUDED.fcmtoken,
//       tenantId = EXCLUDED.tenantId,
//       devicename = EXCLUDED.devicename,
//       updated_at = NOW()
//   `;
//   await pool.query(saveQuery, [deviceId, fcmtoken, tenantId, devicename]);

//   const sinceToken = req.body.since_token ?? req.body.sync_token;

//   if (!deviceId || !tenantId || sinceToken === undefined || sinceToken === null) {
//     return res.status(400).json({ error: "Missing required field: deviceId, tenantId or sync_token" });
//   }

//   console.log("🔄 Sync request received:", { deviceId, sinceToken });

//   // Step 1: Validate plan
//   const planResult = await pool.query(
//     `SELECT purchase_date FROM user_plans WHERE teanut = $1 ORDER BY purchase_date DESC LIMIT 1`,
//     [tenantId]
//   );

//   if (!planResult.rows.length) {
//     return res.status(403).json({ message: "No active plan found for this tenant." });
//   }

//   const purchaseDate = new Date(planResult.rows[0].purchase_date);
//   const oneMonthLater = new Date(purchaseDate);
//   oneMonthLater.setMonth(oneMonthLater.getMonth() + 1);
//   if (new Date() > oneMonthLater) {
//     return res.status(403).json({ message: "Plan expired. Please renew your plan to continue syncing." });
//   }

//   const pullChanges = {};

//   try {
//     // Step 2: Get paired devices excluding self
//     const pairedDeviceIds = await getPairedDeviceIds(deviceId, tenantId);
//     const otherPairedDevices = pairedDeviceIds.filter((id) => id !== deviceId);

//     if (!otherPairedDevices.length) {
//       return res.status(200).json({
//         message: "Device is not paired with any other device. Sync skipped.",
//         sync_token: sinceToken,
//         changes: {},
//       });
//     }

//     // Step 3: Push changes to DB
//     let hasChangesToPush = false;
//     for (const table of tableList) {
//       const incomingRecords = changes?.[table];
//       if (Array.isArray(incomingRecords) && incomingRecords.length > 0) {
//         hasChangesToPush = true;
//         const updatedGlobalIds = [];
//         for (const record of incomingRecords) {
//           try {
//             delete record.sync_token;
//             record.device_id = deviceId;
//             const updated = await safeUpsertRecord(table, record);
//             if (updated?.global_id) updatedGlobalIds.push(updated.global_id);
//           } catch (err) {
//             console.error(`❌ Error inserting/updating ${table}:`, err.message, record);
//           }
//         }
//         await logSync(deviceId, "push", table, updatedGlobalIds);
//         console.log(`📤 Pushed ${updatedGlobalIds.length} records to ${table}`);
//       }
//     }

//     // Step 4: Pull changes from other devices
//     for (const table of tableListpull) {
//       const rows = await getRecordsSinceFromDevices(table, sinceToken, otherPairedDevices);
//       if (rows.length > 0) {
//         pullChanges[table] = rows;
//         await logSync(deviceId, "pull", table, rows.map((r) => r.global_id));
//         console.log(`📥 Pulled ${rows.length} records from ${table}`);
//       }
//     }

//     // Step 5: Get new sync token
//     const newSyncToken = await getCurrentSyncToken();

//     // Step 6: Notify paired devices only if we actually pushed changes
//     if (hasChangesToPush) {
//       const fcmResult = await pool.query(
//         `SELECT fcmtoken FROM devices WHERE deviceId = ANY($1::text[]) AND fcmtoken IS NOT NULL`,
//         [otherPairedDevices]
//       );
//       const tokens = fcmResult.rows.map((r) => r.fcmtoken);

//       if (tokens.length) {
//         const message = {
//           data: { type: "SYNC_TRIGGER", triggeredBy: deviceId },
//         };
//         await Promise.all(tokens.map((token) => admin.messaging().send({ ...message, token })));
//         console.log(`📲 Sync notifications sent to ${tokens.length} devices`);
//       }
//     }

//     return res.status(200).json({ sync_token: newSyncToken, changes: pullChanges });
//   } catch (err) {
//     console.error("❌ syncData error:", err);
//     return res.status(500).json({ error: "Sync failed. Check server logs." });
//   }
// };





// // exports.syncData = async (req, res) => {
// //   const { deviceId, changes, tenantId ,fcmtoken , devicename } = req.body;

// // const saveQuery = `
// //   INSERT INTO devices (deviceId, fcmtoken, tenantId , devicename)
// //   VALUES ($1, $2, $3 , $4)
// //   ON CONFLICT (deviceId) 
// //   DO UPDATE SET 
// //     fcmtoken = EXCLUDED.fcmtoken,
// //     tenantId = EXCLUDED.tenantId,
// //     devicename = EXCLUDED.devicename,
// //     updated_at = NOW()
// // `;
// //   await pool.query(saveQuery, [deviceId, fcmtoken, tenantId, devicename]);
  

// //   // Support both `since_token` and `sync_token`
// //   const sinceToken = req.body.since_token ?? req.body.sync_token;

// //   console.log("🔄 Sync request received");
// //   console.log("🆔 Device ID:", deviceId);
// //   console.log("🔢 Since Sync Token:", sinceToken);

// //   // Validate input
// //   if (!deviceId || !tenantId || sinceToken === undefined || sinceToken === null) {
// //     return res.status(400).json({
// //       error: "Missing required field: deviceId, tenantId or sync_token"
// //     });
// //   }

// // // 🔍 Step 0: Check plan validity
// //     const planQuery = `
// //       SELECT purchase_date 
// //       FROM user_plans 
// //       WHERE teanut = $1
// //       ORDER BY purchase_date DESC
// //       LIMIT 1
// //     `;
// //     const planResult = await pool.query(planQuery, [tenantId]);

// //     if (planResult.rows.length === 0) {
// //       return res.status(403).json({
// //         message: "No active plan found for this tenant. Please purchase a plan."
// //       });
// //     }

// //     const purchaseDate = new Date(planResult.rows[0].purchase_date);
// //     const oneMonthLater = new Date(purchaseDate);
// //     oneMonthLater.setMonth(oneMonthLater.getMonth() + 1);

// //     if (new Date() > oneMonthLater) {
// //       return res.status(403).json({
// //         message: "Plan expired. Please renew your plan to continue syncing."
// //       });
// //     }






// //   const pullChanges = {};

// //   try {
// //     // Step 1: Get paired device IDs
// //     const pairedDeviceIds = await getPairedDeviceIds(deviceId, tenantId);
// //     const otherPairedDevices = pairedDeviceIds.filter(id => id !== deviceId);

// //     console.log("📡 Paired devices:", pairedDeviceIds);
// //     console.log("📶 Other paired devices:", otherPairedDevices);
// //     console.log("🔄 Syncing changes since token:", sinceToken) ;
// //     console.log("Teanant:", tenantId);
// //     // 🚫 If not paired with any other device, skip sync
// //     if (otherPairedDevices.length === 0) {
// //       console.log(`🚫 Device ${deviceId} is not paired with any other device. Skipping sync.`);
// //       return res.status(200).json({
// //         message: "Device is not paired with any other device. Sync skipped.",
// //         sync_token: sinceToken,
// //         changes: {}
// //       });
// //     }

// //     // Step 2: Push - Save incoming changes to DB
// //     for (const table of tableList) {
// //       const incomingRecords = changes?.[table];

// //       if (Array.isArray(incomingRecords) && incomingRecords.length > 0) {
// //         const updatedGlobalIds = [];

// //         for (const record of incomingRecords) {
// //           try {
// //             delete record.sync_token; 
// //             record.device_id = deviceId;

// //             const updated = await safeUpsertRecord(table, record);
// //             if (updated?.global_id) {
// //               updatedGlobalIds.push(updated.global_id);
// //             }
// //           } catch (err) {
// //             console.error(`❌ Error inserting/updating ${table}:`, err.message, record);
// //           }
// //         }

// //         await logSync(deviceId, "push", table, updatedGlobalIds);
// //         console.log(`📤 Pushed ${updatedGlobalIds.length} records to ${table}`);
// //       }
// //     }

// //     // Step 3: Pull - Get new data from other paired devices
// //     for (const table of tableListpull) {
// //       try {
// //         const rows = await getRecordsSinceFromDevices(table, sinceToken, otherPairedDevices);
// //         if (rows.length > 0) {
// //           pullChanges[table] = rows;
// //           const pulledIds = rows.map(r => r.global_id);
// //           await logSync(deviceId, "pull", table, pulledIds);
// //           console.log(`📥 Pulled ${pulledIds.length} records from ${table}`);
// //         }
// //       } catch (err) {
// //         console.error(`❌ Error pulling ${table}:`, err.message);
// //       }
// //     }

// //     // Step 4: Return new sync_token
// //     const newSyncToken = await getCurrentSyncToken();

// //     console.log("✅ Sync complete");
// //     return res.status(200).json({
// //       sync_token: newSyncToken,
// //       changes: pullChanges
// //     });

// //   } catch (err) {
// //     console.error("❌ syncData error:", err);
// //     return res.status(500).json({
// //       error: "Sync failed. Check server logs."
// //     });
// //   }
// // };


// exports.getSyncLogs = async (req, res) => {
//   const { deviceId, direction, startDate, endDate } = req.query;

//   let filters = [];
//   let values = [];

//   if (deviceId) {
//     values.push(deviceId);
//     filters.push(`device_id = $${values.length}`);
//   }

//   if (direction) {
//     values.push(direction);
//     filters.push(`direction = $${values.length}`);
//   }

//   if (startDate) {
//     values.push(startDate);
//     filters.push(`synced_at >= $${values.length}`);
//   }

//   if (endDate) {
//     values.push(endDate);
//     filters.push(`synced_at <= $${values.length}`);
//   }

//   const whereClause = filters.length > 0 ? `WHERE ${filters.join(" AND ")}` : "";

//   const query = `
//     SELECT id, device_id, direction, table_name, synced_at, record_ids
//     FROM sync_logs
//     ${whereClause}
//     ORDER BY synced_at DESC
    
//   `;

//   try {
//     const result = await pool.query(query, values);
//     res.status(200).json({ success: true, data: result.rows });
//   } catch (err) {
//     console.error("❌ Error fetching sync logs:", err.message);
//     res.status(500).json({ success: false, error: "Failed to fetch sync logs" });
//   }
// };









// exports.mannualSync = async (req, res) => {
//   const { deviceId } = req.body;

//   try {
//     // 1. Find device token by deviceId
//     const result = await pool.query(
//       "SELECT fcmtoken FROM devices WHERE deviceid = $1",
//       [deviceId]
//     );

//     if (result.rows.length === 0) {
//       return res.status(404).json({ error: "Device not found" });
//     }

//     const deviceToken = result.rows[0].fcmtoken;

//     // 2. Send FCM notification
//     const message = {
//       token: deviceToken,
//       notification: {
//         title: "Manual Sync",
//         body: "Sync request has been queued for your device."
//       },
//       data: {
//         type: "SYNC_REQUEST",
//         deviceId: deviceId
//       }
//     };

//     const response = await admin.messaging().send(message);

//     console.log("✅ Notification sent:", response);

//     return res.json({ success: true, messageId: response });
//   } catch (err) {
//     console.error("❌ Sync notification failed:", err);
//     return res.status(500).json({ error: "Failed to send sync notification" });
//   }
// };





// exports.devices = async (req, res) => {
//   try {
//     const query = `SELECT * FROM devices`;
//     const result = await pool.query(query); // no params needed

//     return res.status(200).json({
//       success: true,
//       devices: result.rows,
//     });
//   } catch (err) {
//     console.error("❌ Error fetching devices:", err.message);
//     return res.status(500).json({ success: false, error: "Failed to fetch devices" });
//   }
// };







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

// =============================================================
// 🔄 SYNC DATA
// =============================================================
exports.syncData = async (req, res) => {
  const { deviceId, changes, tenantId, fcmtoken, devicename } = req.body;
  const sinceToken = req.body.since_token ?? req.body.sync_token;

  if (!deviceId || !tenantId || sinceToken === undefined || sinceToken === null) {
    return res.status(400).json({ error: "Missing required fields: deviceId, tenantId, or sync_token" });
  }

  console.log("🔄 Sync request received:", { deviceId, tenantId, sinceToken });

  // Step 0️⃣ — Save/Update device info
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
    // Step 2️⃣ — Get paired devices for the same tenant
    const pairedDeviceIds = await getPairedDeviceIds(tenantId);
    const otherPairedDevices = pairedDeviceIds.filter(id => id !== deviceId);

    if (otherPairedDevices.length === 0) {
      return res.status(200).json({
        message: "No paired devices found. Sync skipped.",
        sync_token: sinceToken,
        changes: {}
      });
    }

    // Step 3️⃣ — Push local changes to server
    for (const table of tableList) {
      const incomingRecords = changes?.[table];
      if (!Array.isArray(incomingRecords) || incomingRecords.length === 0) continue;

      hasChangesToPush = true;
      const updatedGlobalIds = [];

      for (const record of incomingRecords) {
        try {
          delete record.sync_token;
          record.device_id = deviceId;
          const updated = await safeUpsertRecord(table, record, tenantId);
          if (updated?.global_id) updatedGlobalIds.push(updated.global_id);
        } catch (err) {
          console.error(`❌ Error in ${table}:`, err.message);
        }
      }

      await logSync(deviceId, tenantId, "push");
      console.log(`📤 ${updatedGlobalIds.length} records pushed to ${table}`);
    }

    // Step 4️⃣ — Pull new changes from other paired devices (same tenant only)
    for (const table of tableListpull) {
      const rows = await getRecordsSinceFromDevices(table, sinceToken, tenantId);
      if (rows.length > 0) {
        pullChanges[table] = rows;
        await logSync(deviceId, tenantId, "pull");
        console.log(`📥 Pulled ${rows.length} records from ${table}`);
      }
    }

    // Step 5️⃣ — Get latest sync token
    const newSyncToken = await getCurrentSyncToken();

    // Step 6️⃣ — Send FCM notifications if changes were pushed
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
        await Promise.all(tokens.map(token => admin.messaging().send({ ...message, token })));
        console.log(`📲 Sent sync notifications to ${tokens.length} devices`);
      }
    }

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
