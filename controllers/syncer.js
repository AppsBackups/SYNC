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

  console.log("🔄 Sync request received:", { deviceId, tenantId, sinceToken });

  // ========== HELPER FUNCTIONS (INLINE) ==========

  // Get paired device IDs for a tenant
  const getPairedDeviceIds = async (deviceId ,tenantId) => {
    try {
      const result = await pool.query(
        `WITH RECURSIVE paired_network AS (
      SELECT device_id, paired_with_device_id
      FROM paired_devices
      WHERE (device_id = $1 OR paired_with_device_id = $1) AND tenant_id = $2

      UNION

      SELECT pd.device_id, pd.paired_with_device_id
      FROM paired_devices pd
      JOIN paired_network pn
        ON pd.device_id = pn.paired_with_device_id
        OR pd.paired_with_device_id = pn.device_id
      WHERE pd.tenant_id = $2
    ),
    all_devices AS (
      SELECT device_id FROM paired_network
      UNION
      SELECT paired_with_device_id FROM paired_network
    )
    SELECT DISTINCT device_id FROM all_devices
    UNION
    SELECT $1; -- Include self`,
        [deviceId ,tenantId]
      );
      return result.rows.map(row => row.deviceId);
    } catch (err) {
      console.error("❌ Error getting paired devices:", err.message);
      return [];
    }
  };

  // Get current sync token for a specific tenant
  const getCurrentSyncTokenForTenant = async (tenantId) => {
    let maxToken = 0;

    for (const table of tableListpull) {
      try {
        const result = await pool.query(
          `SELECT COALESCE(MAX(sync_token), 0) as max_token 
           FROM ${table} 
           WHERE tenantId = $1`,
          [tenantId]
        );
        
        const tableMaxToken = result.rows[0]?.max_token || 0;
        if (tableMaxToken > maxToken) {
          maxToken = tableMaxToken;
        }
      } catch (err) {
        console.error(`⚠️ Error getting sync token from ${table}:`, err.message);
      }
    }

    return maxToken;
  };

  // Get records since a specific token from other devices (tenant-specific)
  const getRecordsSinceFromDevices = async (table, sinceToken, tenantId, excludeDeviceId) => {
    try {
      const result = await pool.query(
        `SELECT * FROM ${table} 
         WHERE tenantId = $1 
         AND sync_token > $2 
         AND deviceId != $3
         ORDER BY sync_token ASC`,
        [tenantId, sinceToken, excludeDeviceId]
      );
      
      return result.rows;
    } catch (err) {
      console.error(`❌ Error fetching from ${table}:`, err.message);
      return [];
    }
  };

  // Safe upsert record with conflict handling
  const safeUpsertRecord = async (table, record, tenantId, deviceId) => {
    try {
      // Get the next sync token for this tenant
      const currentMaxToken = await getCurrentSyncTokenForTenant(tenantId);
      const newSyncToken = currentMaxToken + 1;

      // Extract columns and values from the record
      const columns = Object.keys(record);
      const values = Object.values(record);
      
      // Add tenant, device, and sync_token
      columns.push('tenantId', 'deviceId', 'sync_token', 'updated_at');
      values.push(tenantId, deviceId, newSyncToken, new Date());

      // Build the INSERT query
      const placeholders = values.map((_, i) => `$${i + 1}`).join(', ');
      const columnNames = columns.join(', ');
      
      // Build the ON CONFLICT UPDATE clause
      const updateClause = columns
        .filter(col => col !== 'global_id') // Don't update the primary key
        .map(col => `${col} = EXCLUDED.${col}`)
        .join(', ');

      const query = `
        INSERT INTO ${table} (${columnNames})
        VALUES (${placeholders})
        ON CONFLICT (global_id)
        DO UPDATE SET ${updateClause}
        RETURNING *
      `;

      const result = await pool.query(query, values);
      return result.rows[0];
    } catch (err) {
      console.error(`❌ Error upserting record in ${table}:`, err.message);
      throw err;
    }
  };

  // Log sync activity
  const logSync = async (deviceId, tenantId, action) => {
    try {
      await pool.query(
        `INSERT INTO sync_logs (deviceId, tenantId, action, timestamp)
         VALUES ($1, $2, $3, NOW())`,
        [deviceId, tenantId, action]
      );
    } catch (err) {
      console.error("⚠️ Error logging sync:", err.message);
    }
  };

  // ========== MAIN SYNC LOGIC ==========

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
    const pairedDeviceIds = await getPairedDeviceIds(deviceId ,tenantId);
    const otherPairedDevices = pairedDeviceIds.filter(id => id !== deviceId);

    if (otherPairedDevices.length === 0) {
      return res.status(200).json({
        message: "No paired devices found. Sync skipped.",
        sync_token: sinceToken,
        changes: {}
      });
    }

    // Step 3️⃣ — Push local changes from this device
    for (const table of tableList) {
      const incomingRecords = changes?.[table];
      if (!Array.isArray(incomingRecords) || incomingRecords.length === 0) continue;

      hasChangesToPush = true;
      const updatedGlobalIds = [];

      for (const record of incomingRecords) {
        try {
          delete record.sync_token;
          const updated = await safeUpsertRecord(table, record, tenantId, deviceId);
          if (updated?.global_id) updatedGlobalIds.push(updated.global_id);
        } catch (err) {
          console.error(`❌ Error in ${table}:`, err.message);
        }
      }

      await logSync(deviceId, tenantId, "push");
      console.log(`📤 ${updatedGlobalIds.length} records pushed to ${table}`);
    }

    // Step 4️⃣ — Pull new changes from other devices (TENANT-SPECIFIC)
    for (const table of tableListpull) {
      const rows = await getRecordsSinceFromDevices(table, sinceToken, tenantId, deviceId);
      if (rows.length > 0) {
        pullChanges[table] = rows;
        await logSync(deviceId, tenantId, "pull");
        console.log(`📥 Pulled ${rows.length} records from ${table}`);
      }
    }

    // ✅ Step 5️⃣ — Calculate NEW sync token (PER-TENANT)
    let newSyncToken = sinceToken;

    // 1️⃣ Check the highest sync_token in pulled data
    for (const table of Object.keys(pullChanges)) {
      const tableRows = pullChanges[table];
      if (tableRows.length > 0) {
        const maxTokenInTable = Math.max(...tableRows.map(r => r.sync_token));
        if (maxTokenInTable > newSyncToken) {
          newSyncToken = maxTokenInTable;
        }
      }
    }

    // 2️⃣ Get the latest sync_token FOR THIS TENANT from the database
    const dbToken = await getCurrentSyncTokenForTenant(tenantId);

    // 3️⃣ Use the highest value to ensure we never go backwards
    newSyncToken = Math.max(newSyncToken, dbToken);

    console.log(`🔢 Sync token for tenant ${tenantId}: ${sinceToken} → ${newSyncToken}`);

    // Step 6️⃣ — Send FCM notifications (excluding sender)
    if (hasChangesToPush) {
      const fcmResult = await pool.query(
        `SELECT fcmtoken FROM devices WHERE tenantId = $1 AND deviceId != $2 AND fcmtoken IS NOT NULL`,
        [tenantId, deviceId]
      );

      const tokens = fcmResult.rows.map(r => r.fcmtoken);
      console.log("🚀 Sending FCM to devices:", tokens, "excluding:", deviceId);

      if (tokens.length > 0) {
        const message = {
          data: { type: "SYNC_TRIGGER", triggeredBy: deviceId }
        };
        await Promise.all(tokens.map(token => admin.messaging().send({ ...message, token })));
        console.log(`📲 Sent sync notifications to ${tokens.length} devices`);
      }
    }

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