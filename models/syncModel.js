




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







const pool = require("../config/db");





const getRecordsSinceFromDevices = async (table, sinceToken, tenant, deviceId) => {
  
  const query = `
    SELECT * FROM "${table}"
    WHERE sync_token > $1
      AND tenant_id = $2
      AND device_id != $3
    ORDER BY sync_token ASC;
  `;
  const { rows } = await pool.query(query, [sinceToken, tenant, deviceId]);


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


const getCurrentSyncToken = async () => {
  const { rows } = await pool.query(`SELECT current_token FROM sync_token`);
  return rows[0]?.current_token || 0;
};

// 🔹 Safe upsert that ignores errors
const safeUpsertRecord = async (table, record, tenant ,deviceId) => {
  try {
    
    record.device_id = deviceId;  // Make sure this runs before safeUpsertRecord
    return await upsertRecord(table, record, tenant);
  } catch (err) {
    console.warn(`⚠️ Skipping record due to error in ${table}:`, err.message);
    return null;
  }
};





const upsertRecord = async (table, record, tenantId) => {
  const client = await pool.connect();

  try {
    if (!table || !record || !record.global_id) {
      console.warn("⚠️ Skipped record: Missing table or global_id", { table, record });
      return null; // skip record silently
    }

    record.tenant_id = tenantId;
    await client.query("BEGIN");

    const { rows: existingRows } = await client.query(
      `SELECT sync_token FROM "${table}" WHERE global_id = $1`,
      [record.global_id]
    );


    const existingToken = existingRows.length > 0 ? existingRows[0].sync_token : null;
    // console.log(existingToken)

    if (existingToken !== null && record.sync_token < existingToken) {
      console.warn(
        `⚠️ Skipped record (Outdated sync_token): client=${record.sync_token}, server=${existingToken}, table=${table}, global_id=${record.global_id}`
      );
      await client.query("ROLLBACK");
      return null; 
    }

    
    const { rows: tokenRows } = await client.query(
      `UPDATE sync_token SET current_token = current_token + 1 RETURNING current_token`
    );
    const newSyncToken = tokenRows[0].current_token;
    record.sync_token = newSyncToken;

    // 🏗 Prepare insert or update
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
      WHERE "${table}"."sync_token" <= EXCLUDED."sync_token"
      RETURNING *;
    `;

    const { rows } = await client.query(query, values);
    await client.query("COMMIT");

    if (rows.length === 0) {
      console.warn(`⚠️ Skipped record (No update applied): ${record.global_id}`);
      return null;
    }

    return rows[0];
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("❌ Error in upsertRecord:", {
      table,
      global_id: record?.global_id,
      error: err.message,
    });
    return null; // skip record and continue
  } finally {
    client.release();
  }
};









// const upsertRecord = async (table, record, tenantId) => {
//   const client = await pool.connect();

//   try {
//     if (!table || !record || !record.global_id) {
//       throw new Error("Invalid table or record");
//     }

//     // ✅ Store tenant_id
//     record.tenant_id = tenantId;

//     await client.query("BEGIN");

    
//     const { rows: tokenRows } = await client.query(
//       `UPDATE sync_token SET current_token = current_token + 1 RETURNING current_token`
//     );
//     const syncToken = tokenRows[0].current_token;
//     record.sync_token = syncToken;

   
//     const columns = Object.keys(record);
//     const values = Object.values(record);
//     const placeholders = columns.map((_, i) => `$${i + 1}`).join(",");
//     const quotedColumns = columns.map(c => `"${c}"`).join(",");
//     const updates = columns
//       .filter(c => c !== "global_id")
//       .map(c => `"${c}" = EXCLUDED."${c}"`)
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
//   } catch (err) {
//     await client.query("ROLLBACK");
//     console.error("❌ Error in upsertRecord:", { table, record, error: err.message });
//     throw err;
//   } finally {
//     client.release();
//   }
// };











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


