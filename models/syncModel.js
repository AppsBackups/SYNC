// const pool = require("../config/db");


// const getRecordsSinceFromDevices = async (table, sinceToken, deviceIds, tenantId) => {
//   if (
//     !table ||
//     sinceToken === undefined ||
//     !Array.isArray(deviceIds) ||
//     deviceIds.length === 0 ||
//     !tenantId
//   ) {
//     return [];
//   }

//   const placeholders = deviceIds.map((_, i) => `$${i + 3}`).join(", ");
//   const query = `
//     SELECT * FROM "${table}"
//     WHERE "sync_token" > $1
//       AND "tenant" = $2
//       AND "device_id" IN (${placeholders})
//     ORDER BY "sync_token" ASC
//   `;
//   const values = [sinceToken, tenantId, ...deviceIds];

//   try {
//     const { rows } = await pool.query(query, values);
//     return rows;
//   } catch (error) {
//     console.error(`❌ Error in getRecordsSinceFromDevices for ${table}:`, error.message);
//     return [];
//   }
// };



const getPairedDeviceIds = async (deviceId, tenantId) => {
  const query = `
    WITH RECURSIVE paired_network AS (
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
    SELECT $1; -- Include self
  `;

  try {
    const { rows } = await pool.query(query, [deviceId, tenantId]);
    return rows.map(row => row.device_id);
  } catch (error) {
    console.error("❌ Error in getPairedDeviceIds:", error.message);
    return [];
  }
};

// const getPairedDeviceIds = async (deviceId, tenantId) => {
//   try {
//     // Check if device exists and has a valid tenant
//     const deviceCheck = await pool.query(
//       `SELECT tenantId FROM devices WHERE deviceId = $1`,
//       [deviceId]
//     );

//     if (!deviceCheck.rows.length) {
//       console.warn(`⚠️ Device ${deviceId} not found in devices table.`);
//       return [deviceId];
//     }

//     // Ensure device belongs to same tenant before pairing traversal
//     const query = `
//       WITH RECURSIVE paired_network AS (
//         SELECT device_id, paired_with_device_id
//         FROM paired_devices
//         WHERE (device_id = $1 OR paired_with_device_id = $1)
//           AND tenant_id = $2

//         UNION

//         SELECT pd.device_id, pd.paired_with_device_id
//         FROM paired_devices pd
//         JOIN paired_network pn
//           ON pd.device_id = pn.paired_with_device_id
//           OR pd.paired_with_device_id = pn.device_id
//         WHERE pd.tenant_id = $2
//       ),
//       all_devices AS (
//         SELECT device_id FROM paired_network
//         UNION
//         SELECT paired_with_device_id FROM paired_network
//       )
//       SELECT DISTINCT device_id FROM all_devices
//       UNION
//       SELECT $1; -- include self
//     `;

//     const { rows } = await pool.query(query, [deviceId, tenantId]);
//     const deviceIds = rows.map(row => row.device_id);

//     console.log(`🔗 Paired devices for ${deviceId} (tenant: ${tenantId}):`, deviceIds);

//     return deviceIds;
//   } catch (error) {
//     console.error("❌ Error in getPairedDeviceIds:", error.message);
//     return [deviceId]; // Always return self to prevent breaking sync
//   }
// };


// const getCurrentSyncToken = async () => {
//   const query = `SELECT current_token FROM sync_token LIMIT 1`;
//   const { rows } = await pool.query(query);
//   return rows[0]?.current_token ?? 0;
// };

// const upsertRecord = async (table, record) => {
//   const client = await pool.connect();
//   try {
//     if (!table || !record || !record.global_id) throw new Error("Invalid table or record");

//     await client.query("BEGIN");

//     // Get and increment sync_token
//     const { rows: tokenRows } = await client.query(
//       `UPDATE sync_token SET current_token = current_token + 1 RETURNING current_token`
//     );
//     const syncToken = tokenRows[0].current_token;
//     record.sync_token = syncToken;

//     const columns = Object.keys(record);
//     const values = Object.values(record);
//     const placeholders = columns.map((_, i) => `$${i + 1}`).join(",");
//     const quotedColumns = columns.map(col => `"${col}"`).join(",");
//     const updates = columns
//       .filter(col => col !== "global_id")
//       .map(col => `"${col}" = EXCLUDED."${col}"`)
//       .join(", ");

//     const query = `
//       INSERT INTO "${table}" (${quotedColumns})
//       VALUES (${placeholders})
//       ON CONFLICT ("global_id")
//       DO UPDATE SET ${updates}
//       RETURNING *;
//     `;

//     const { rows } = await client.query(query, values);

//     await client.query("COMMIT");
//     return rows[0];
//   } catch (error) {
//     await client.query("ROLLBACK");
//     console.error("❌ Error in upsertRecord:", { table, record, error: error.message });
//     throw error;
//   } finally {
//     client.release();
//   }
// };


// const safeUpsertRecord = async (table, record) => {
//   const client = await pool.connect();
//   try {
//     if (!table || !record || !record.global_id)
//       throw new Error("Invalid table or record");

//     await client.query("BEGIN");

//     // 🧠 Check if the record already exists
//     const query = `SELECT sync_token FROM "${table}" WHERE global_id = $1`;
//     const { rows: existingRows } = await client.query(query, [record.global_id]);

//     const existing = existingRows[0];

//     // ⚖️ Compare sync_token version to prevent overwriting newer records
//     if (existing && existing.sync_token > (record.sync_token || 0)) {
//       console.log(
//         `⏭ Skipped older record (incoming ${record.sync_token || 0}, existing ${existing.sync_token}) for table: ${table}`
//       );
//       await client.query("ROLLBACK");
//       return { skipped: true };
//     }

//     // 🆕 Proceed with upsert only if newer or non-existing
//     const result = await upsertRecord(table, record);

//     await client.query("COMMIT");
//     return result;

//   } catch (error) {
//     await client.query("ROLLBACK");
//     console.error("❌ Error in safeUpsertRecord:", error.message);
//     throw error;
//   } finally {
//     client.release();
//   }
// };



// const logSync = async (deviceId, direction, tableName, recordIds = []) => {
//   const query = `
//     INSERT INTO sync_logs (device_id, direction, table_name, record_ids, synced_at)
//     VALUES ($1, $2, $3, $4, NOW())
//   `;
//   try {
//     await pool.query(query, [deviceId, direction, tableName, recordIds]);
//   } catch (error) {
//     console.error("❌ Error in logSync:", { deviceId, direction, tableName, error: error.message });
//   }
// };

// module.exports = {
//   getRecordsSinceFromDevices,
//   getPairedDeviceIds,
//   getCurrentSyncToken,
//   upsertRecord,
//   logSync,
//   safeUpsertRecord
// };






const pool = require("../config/db");

const upsertRecord = async (table, record, tenantId) => {
  const client = await pool.connect();

  try {
    if (!table || !record || !record.global_id) {
      throw new Error("Invalid table or record");
    }

    // ✅ Store tenant_id
    record.tenant_id = tenantId;

    await client.query("BEGIN");

    // ✅ Get sync token
    const { rows: tokenRows } = await client.query(
      `UPDATE sync_token SET current_token = current_token + 1 RETURNING current_token`
    );
    const syncToken = tokenRows[0].current_token;
    record.sync_token = syncToken;

    // ✅ Prepare insert/update
    const columns = Object.keys(record);
    const values = Object.values(record);
    const placeholders = columns.map((_, i) => `$${i + 1}`).join(",");
    const quotedColumns = columns.map(c => `"${c}"`).join(",");
    const updates = columns
      .filter(c => c !== "global_id")
      .map(c => `"${c}" = EXCLUDED."${c}"`)
      .join(", ");

    const query = `
      INSERT INTO "${table}" (${quotedColumns})
      VALUES (${placeholders})
      ON CONFLICT ("global_id")
      DO UPDATE SET ${updates}
      RETURNING *;
    `;

    const { rows } = await client.query(query, values);
    await client.query("COMMIT");

    return rows[0];
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("❌ Error in upsertRecord:", { table, record, error: err.message });
    throw err;
  } finally {
    client.release();
  }
};


// 🔹 Get all records from a table since a sync token
const getRecordsSinceFromDevices = async (table, sinceToken, tenant) => {
  const query = `
    SELECT * FROM "${table}"
    WHERE sync_token > $1 AND tenant_id = $2 AND deleted = false
    ORDER BY sync_token ASC;
  `;
  const { rows } = await pool.query(query, [sinceToken, tenant]);
  return rows;
};

// 🔹 Soft delete record (sets deleted = true)
const deleteRecord = async (table, global_id, tenant) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const { rows: tokenRows } = await client.query(
      `UPDATE sync_token SET current_token = current_token + 1 RETURNING current_token`
    );
    const syncToken = tokenRows[0].current_token;

    const query = `
      UPDATE "${table}"
      SET deleted = true, sync_token = $1
      WHERE global_id = $2 AND tenant = $3
      RETURNING *;
    `;
    const { rows } = await client.query(query, [syncToken, global_id, tenant]);
    await client.query("COMMIT");
    return rows[0];
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("❌ Error in deleteRecord:", error.message);
    throw error;
  } finally {
    client.release();
  }
};

// 🔹 Get current sync token
const getCurrentSyncToken = async () => {
  const { rows } = await pool.query(`SELECT current_token FROM sync_token`);
  return rows[0]?.current_token || 0;
};

// 🔹 Safe upsert that ignores errors
const safeUpsertRecord = async (table, record, tenant) => {
  try {
    return await upsertRecord(table, record, tenant);
  } catch (err) {
    console.warn(`⚠️ Skipping record due to error in ${table}:`, err.message);
    return null;
  }
};

// 🔹 Log sync event
const logSync = async (device_id, tenant, status) => {
  await pool.query(
    `INSERT INTO sync_log (device_id, tenant_id, status, synced_at) VALUES ($1, $2, $3, NOW())`,
    [device_id, tenant, status]
  );
};

// 🔹 Get paired device IDs
// const getPairedDeviceIds = async (tenant) => {
//   const { rows } = await pool.query(
//     `SELECT device_id FROM device_pairings WHERE tenant = $1`,
//     [tenant]
//   );
//   return rows.map(r => r.device_id);
// };

module.exports = {
  upsertRecord,
  safeUpsertRecord,
  getRecordsSinceFromDevices,
  deleteRecord,
  getCurrentSyncToken,
  logSync,
  getPairedDeviceIds
};


