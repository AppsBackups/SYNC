const pool = require("../config/db");

/**
 * 🔹 Get or increment tenant-specific sync token
 */
const getNextSyncToken = async (client, tenantId) => {
  const { rows } = await client.query(
    `
    INSERT INTO sync_token (tenant_id, current_token)
    VALUES ($1, 1)
    ON CONFLICT (tenant_id)
    DO UPDATE SET current_token = sync_token.current_token + 1
    RETURNING current_token
    `,
    [tenantId]
  );
  return rows[0].current_token;
};

/**
 * 🔹 Get current sync token for a tenant
 */
const getCurrentSyncToken = async (tenantId) => {
  const { rows } = await pool.query(
    `SELECT current_token FROM sync_token WHERE tenant_id = $1`,
    [tenantId]
  );
  return rows[0]?.current_token || 0;
};

/**
 * 🔹 Recursive query to get all paired device IDs
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
    SELECT $1; -- include self
  `;

  try {
    const { rows } = await pool.query(query, [deviceId, tenantId]);
    return rows.map((r) => r.device_id);
  } catch (err) {
    console.error("❌ Error in getPairedDeviceIds:", err.message);
    return [];
  }
};

/**
 * 🔹 Get records updated since last token, from other devices
 */
const getRecordsSinceFromDevices = async (table, sinceToken, tenantId, deviceId) => {
  const query = `
    SELECT * FROM "${table}"
    WHERE sync_token > $1
      AND tenant_id = $2
      AND device_id != $3
    ORDER BY sync_token ASC;
  `;
  const { rows } = await pool.query(query, [sinceToken, tenantId, deviceId]);
  return rows;
};

/**
 * 🔹 Soft delete record (marks deleted = true)
 */
const deleteRecord = async (table, global_id, tenantId) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const syncToken = await getNextSyncToken(client, tenantId);

    const query = `
      UPDATE "${table}"
      SET deleted = true, sync_token = $1
      WHERE global_id = $2 AND tenant_id = $3
      RETURNING *;
    `;

    const { rows } = await client.query(query, [syncToken, global_id, tenantId]);
    await client.query("COMMIT");
    return rows[0];
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("❌ Error in deleteRecord:", err.message);
    throw err;
  } finally {
    client.release();
  }
};

/**
 * 🔹 Safe upsert (skips bad records)
 */
// const safeUpsertRecord = async (table, record, tenantId, deviceId ,newsyncToken) => {
//   try {
//     record.device_id = deviceId;
//     return await upsertRecord(table, record, tenantId , newsyncToken);
//   } catch (err) {
//     console.warn(`⚠️ Skipping record in ${table}:`, err.message);
//     return null;
//   }
// };

// /**
//  * 🔹 Upsert record (with tenant-specific sync token)
//  */
// const upsertRecord = async (table, record, tenantId, newsyncToken) => {
//   const client = await pool.connect();

//   try {
//     if (!table || !record || !record.global_id) {
//       console.warn("⚠️ Skipped record: Missing table or global_id", { table, record });
//       return null;
//     }

//     record.tenant_id = tenantId;
//     await client.query("BEGIN");

//     // Get existing sync_token for conflict resolution
//     const { rows: existingRows } = await client.query(
//       `SELECT sync_token FROM "${table}" WHERE global_id = $1`,
//       [record.global_id]
//     );

//     const existingToken = existingRows.length > 0 ? existingRows[0].sync_token : null;

//     if (existingToken !== null && record.sync_token < existingToken) {
//       console.warn(
//         `⚠️ Skipped outdated record (client=${record.sync_token}, server=${existingToken})`
//       );
//       await client.query("ROLLBACK");
//       return null;
//     }

//     // ✅ Use provided token, don’t generate a new one here
//     record.sync_token = newsyncToken;

//     const columns = Object.keys(record);
//     const values = Object.values(record);
//     const placeholders = columns.map((_, i) => `$${i + 1}`).join(",");
//     const quotedColumns = columns.map((c) => `"${c}"`).join(",");
//     const updates = columns
//       .filter((c) => c !== "global_id")
//       .map((c) => `"${c}" = EXCLUDED."${c}"`)
//       .join(", ");

//     const query = `
//       INSERT INTO "${table}" (${quotedColumns})
//       VALUES (${placeholders})
//       ON CONFLICT ("global_id")
//       DO UPDATE SET ${updates}
//       WHERE "${table}"."sync_token" <= EXCLUDED."sync_token"
//       RETURNING *;
//     `;

//     const { rows } = await client.query(query, values);
//     await client.query("COMMIT");

//     return rows[0] || null;
//   } catch (err) {
//     await client.query("ROLLBACK");
//     console.error("❌ Error in upsertRecord:", {
//       table,
//       global_id: record?.global_id,
//       error: err.message,
//     });
//     return null;
//   } finally {
//     client.release();
//   }
// };





const safeUpsertRecord = async (table, record, tenantId, deviceId, newsyncToken) => {
  try {
    record.device_id = deviceId;
    return await upsertRecord(table, record, tenantId, newsyncToken);
  } catch (err) {
    console.warn(`⚠️ Skipping record in ${table}:`, err.message);
    return null;
  }
};

/**
 * 🔹 Upsert record (tenant-aware + token-stable)
 */
const upsertRecord = async (table, record, tenantId, newsyncToken) => {
  const client = await pool.connect();

  try {
    if (!table || !record || !record.global_id) {
      console.warn("⚠️ Skipped record: Missing table or global_id", { table, record });
      return null;
    }

    record.tenant_id = tenantId;
    record.sync_token = newsyncToken; // use one token for this entire sync session

    await client.query("BEGIN");

    // Fetch existing sync_token to prevent overwriting newer data
    const { rows: existingRows } = await client.query(
      `SELECT sync_token FROM "${table}" WHERE global_id = $1`,
      [record.global_id]
    );
    const existingToken = existingRows[0]?.sync_token ?? null;

    if (existingToken !== null && record.sync_token < existingToken) {
      console.warn(
        `⚠️ Skipped outdated record (client=${record.sync_token}, server=${existingToken})`
      );
      await client.query("ROLLBACK");
      return null;
    }

    const columns = Object.keys(record);
    const values = Object.values(record);
    const placeholders = columns.map((_, i) => `$${i + 1}`).join(",");
    const quotedColumns = columns.map((c) => `"${c}"`).join(",");
    const updates = columns
      .filter((c) => c !== "global_id")
      .map((c) => `"${c}" = EXCLUDED."${c}"`)
      .join(", ");

    // 🧠 Only update if new token > old AND data has actually changed
    const query = `
      INSERT INTO "${table}" (${quotedColumns})
      VALUES (${placeholders})
      ON CONFLICT ("global_id")
      DO UPDATE SET ${updates}
      WHERE 
        "${table}"."sync_token" < EXCLUDED."sync_token"
        AND (
          ${columns
            .filter(c => !["global_id", "sync_token"].includes(c))
            .map(c => `"${table}"."${c}" IS DISTINCT FROM EXCLUDED."${c}"`)
            .join(" OR ")}
        )
      RETURNING *;
    `;

    const { rows } = await client.query(query, values);
    await client.query("COMMIT");

    return rows[0] || null;
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("❌ Error in upsertRecord:", {
      table,
      global_id: record?.global_id,
      error: err.message,
    });
    return null;
  } finally {
    client.release();
  }
};











/**
 * 🔹 Log sync event
 */
const logSync = async (device_id, tenantId, status) => {
  await pool.query(
    `INSERT INTO sync_log (device_id, tenant_id, status, synced_at) VALUES ($1, $2, $3, NOW())`,
    [device_id, tenantId, status]
  );
};

module.exports = {
  upsertRecord,
  safeUpsertRecord,
  getRecordsSinceFromDevices,
  deleteRecord,
  getCurrentSyncToken,
  getPairedDeviceIds,
  logSync,
};
