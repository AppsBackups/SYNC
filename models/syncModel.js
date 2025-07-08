const pool = require("../config/db");

/**
 * 🔁 Get records from a table updated since a sync_token
 * Only includes changes from specific device IDs
 */
const getRecordsSinceFromDevices = async (table, sinceToken, deviceIds) => {
  if (!table || sinceToken === undefined || !Array.isArray(deviceIds) || deviceIds.length === 0) {
    return [];
  }

  const placeholders = deviceIds.map((_, i) => `$${i + 2}`).join(", ");
  const query = `
    SELECT * FROM "${table}"
    WHERE "sync_token" > $1
      AND "device_id" IN (${placeholders})
    ORDER BY "sync_token" ASC
  `;
  const values = [sinceToken, ...deviceIds];

  try {
    const { rows } = await pool.query(query, values);
    return rows;
  } catch (error) {
    console.error(`❌ Error in getRecordsSinceFromDevices for ${table}:`, error.message);
    return [];
  }
};

/**
 * 🔁 Get all paired device IDs for a given deviceId
 */
const getPairedDeviceIds = async (deviceId) => {
  const query = `
    SELECT 
      CASE
        WHEN device_id = $1 THEN paired_with_device_id
        ELSE device_id
      END AS paired_id
    FROM paired_devices
    WHERE device_id = $1 OR paired_with_device_id = $1
  `;
  try {
    const { rows } = await pool.query(query, [deviceId]);
    return rows.map(row => row.paired_id);
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
    const quotedColumns = columns.map(col => `"${col}"`).join(",");
    const updates = columns
      .filter(col => col !== "global_id")
      .map(col => `"${col}" = EXCLUDED."${col}"`)
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
  logSync
};
