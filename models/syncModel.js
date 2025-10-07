// const pool = require("../config/db");

// /**
//  * 🔁 Get records from a table updated since a sync_token
//  * Only includes changes from specific device IDs
//  */
// const getRecordsSinceFromDevices = async (table, sinceToken, deviceIds) => {
//   if (!table || sinceToken === undefined || !Array.isArray(deviceIds) || deviceIds.length === 0) {
//     return [];
//   }

//   const placeholders = deviceIds.map((_, i) => `$${i + 2}`).join(", ");
//   const query = `
//     SELECT * FROM "${table}"
//     WHERE "sync_token" > $1
//       AND "device_id" IN (${placeholders})
//     ORDER BY "sync_token" ASC
//   `;
//   const values = [sinceToken, ...deviceIds];

//   try {
//     const { rows } = await pool.query(query, values);
//     return rows;
//   } catch (error) {
//     console.error(`❌ Error in getRecordsSinceFromDevices for ${table}:`, error.message);
//     return [];
//   }
// };

// /**
//  * 🔁 Get all paired device IDs for a given deviceId
//  */
// const getPairedDeviceIds = async (deviceId, tenantId) => {
//   const query = `
//     WITH RECURSIVE paired_network AS (
//       SELECT device_id, paired_with_device_id
//       FROM paired_devices
//       WHERE (device_id = $1 OR paired_with_device_id = $1) AND tenant_id = $2

//       UNION

//       SELECT pd.device_id, pd.paired_with_device_id
//       FROM paired_devices pd
//       JOIN paired_network pn
//         ON pd.device_id = pn.paired_with_device_id
//         OR pd.paired_with_device_id = pn.device_id
//       WHERE pd.tenant_id = $2
//     ),
//     all_devices AS (
//       SELECT device_id FROM paired_network
//       UNION
//       SELECT paired_with_device_id FROM paired_network
//     )
//     SELECT DISTINCT device_id FROM all_devices
//     UNION
//     SELECT $1; -- Include self
//   `;

//   try {
//     const { rows } = await pool.query(query, [deviceId, tenantId]);
//     return rows.map(row => row.device_id);
//   } catch (error) {
//     console.error("❌ Error in getPairedDeviceIds:", error.message);
//     return [];
//   }
// };


// /**
//  * 🔄 Get the latest global sync_token from sync_token table
//  */
// const getCurrentSyncToken = async () => {
//   const query = `SELECT current_token FROM sync_token LIMIT 1`;
//   const { rows } = await pool.query(query);
//   return rows[0]?.current_token ?? 0;
// };

// /**
//  * ⬆️ Insert or update record with conflict resolution and sync_token assignment
//  */
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


// /**
//  * 📝 Log sync activity to sync_logs
//  */
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

/**
 * 🔁 Get records from a table updated since a sync_token
 * - Includes only records from paired devices (same tenant)
 * - Excludes deleted records
 */
const getRecordsSinceFromDevices = async (table, sinceToken, deviceIds, tenantId) => {
  if (
    !table ||
    sinceToken === undefined ||
    !Array.isArray(deviceIds) ||
    deviceIds.length === 0 ||
    !tenantId
  ) {
    return [];
  }

  const placeholders = deviceIds.map((_, i) => `$${i + 2}`).join(", ");
  const query = `
    SELECT *
    FROM "${table}"
    WHERE "sync_token" > $1
      AND "device_id" IN (${placeholders})
      AND "tenant_id" = $${deviceIds.length + 2}
      AND ("is_deleted" IS NULL OR "is_deleted" = false)
    ORDER BY "sync_token" ASC
  `;

  const values = [sinceToken, ...deviceIds, tenantId];

  try {
    const { rows } = await pool.query(query, values);
    return rows;
  } catch (error) {
    console.error(`❌ Error in getRecordsSinceFromDevices for ${table}:`, error.message);
    return [];
  }
};

/**
 * 🔁 Get all paired device IDs for a given deviceId (only within the same tenant)
 */
const getPairedDeviceIds = async (deviceId, tenantId) => {
  const query = `
    WITH RECURSIVE paired_network AS (
      SELECT device_id, paired_with_device_id
      FROM paired_devices
      WHERE (device_id = $1 OR paired_with_device_id = $1)
        AND tenant_id = $2

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
    return rows.map((row) => row.device_id);
  } catch (error) {
    console.error("❌ Error in getPairedDeviceIds:", error.message);
    return [];
  }
};

/**
 * 🔄 Get the latest global sync_token from sync_token table
 */
const getCurrentSyncToken = async () => {
  const query = `SELECT current_token FROM sync_token LIMIT 1`;
  const { rows } = await pool.query(query);
  return rows[0]?.current_token ?? 0;
};

/**
 * ⬆️ Insert or update record with conflict resolution and sync_token assignment
 */
const upsertRecord = async (table, record) => {
  const client = await pool.connect();
  try {
    if (!table || !record || !record.global_id) throw new Error("Invalid table or record");

    await client.query("BEGIN");

    // Get and increment sync_token
    const { rows: tokenRows } = await client.query(
      `UPDATE sync_token SET current_token = current_token + 1 RETURNING current_token`
    );
    const syncToken = tokenRows[0].current_token;
    record.sync_token = syncToken;

    const columns = Object.keys(record);
    const values = Object.values(record);
    const placeholders = columns.map((_, i) => `$${i + 1}`).join(",");
    const quotedColumns = columns.map((col) => `"${col}"`).join(",");
    const updates = columns
      .filter((col) => col !== "global_id")
      .map((col) => `"${col}" = EXCLUDED."${col}"`)
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
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("❌ Error in upsertRecord:", { table, record, error: error.message });
    throw error;
  } finally {
    client.release();
  }
};

/**
 * 🧠 Safe upsert that prevents overwriting newer records or restoring deleted data
 */
const safeUpsertRecord = async (table, record) => {
  const client = await pool.connect();
  try {
    if (!table || !record || !record.global_id)
      throw new Error("Invalid table or record");

    await client.query("BEGIN");

    // 🧠 Check if the record already exists
    const query = `SELECT sync_token, is_deleted FROM "${table}" WHERE global_id = $1`;
    const { rows: existingRows } = await client.query(query, [record.global_id]);
    const existing = existingRows[0];

    // 🪦 Skip if existing record is deleted
    if (existing && existing.is_deleted) {
      console.log(`🪦 Skipping upsert for deleted record in ${table}`);
      await client.query("ROLLBACK");
      return { skipped: true };
    }

    // ⚖️ Compare sync_token to avoid overwriting newer record
    if (existing && existing.sync_token > (record.sync_token || 0)) {
      console.log(
        `⏭ Skipped older record (incoming ${record.sync_token || 0}, existing ${existing.sync_token}) for table: ${table}`
      );
      await client.query("ROLLBACK");
      return { skipped: true };
    }

    // 🆕 Proceed with upsert only if newer or non-existing
    const result = await upsertRecord(table, record);

    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("❌ Error in safeUpsertRecord:", error.message);
    throw error;
  } finally {
    client.release();
  }
};

/**
 * 📝 Log sync activity to sync_logs
 */
const logSync = async (deviceId, direction, tableName, recordIds = []) => {
  const query = `
    INSERT INTO sync_logs (device_id, direction, table_name, record_ids, synced_at)
    VALUES ($1, $2, $3, $4, NOW())
  `;
  try {
    await pool.query(query, [deviceId, direction, tableName, recordIds]);
  } catch (error) {
    console.error("❌ Error in logSync:", { deviceId, direction, tableName, error: error.message });
  }
};

module.exports = {
  getRecordsSinceFromDevices,
  getPairedDeviceIds,
  getCurrentSyncToken,
  upsertRecord,
  logSync,
  safeUpsertRecord,
};
