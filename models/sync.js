const pool = require("../config/db");

// 🔁 Get records from a table updated since a timestamp, filtered by device IDs
const getRecordsSinceFromDevices = async (table, timestamp, deviceIds) => {
  if (!table || !timestamp || !Array.isArray(deviceIds) || deviceIds.length === 0) {
    return [];
  }

  const placeholders = deviceIds.map((_, i) => `$${i + 2}`).join(", ");
  const query = `
    SELECT * FROM "${table}"
    WHERE "last_modified"::timestamptz > $1::timestamptz
      AND "device_id" IN (${placeholders})
    ORDER BY "last_modified"::timestamptz ASC
  `;
  const values = [timestamp, ...deviceIds];

  try {
    const { rows } = await pool.query(query, values);
    return rows;
  } catch (error) {
    console.error(`❌ Error in getRecordsSinceFromDevices for ${table}:`, error.message);
    return [];
  }
};

// 🔁 Get list of deviceIds paired with this device
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
  const { rows } = await pool.query(query, [deviceId]);
  return rows.map(row => row.paired_id);
};

// 🔄 Insert or update a record with conflict resolution
const upsertRecord = async (table, record) => {
  try {
    if (!table || !record || !record.global_id) throw new Error("Invalid table or record");

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
      WHERE "${table}"."last_modified"::timestamptz <= EXCLUDED."last_modified"::timestamptz
      RETURNING *;
    `;

    const { rows } = await pool.query(query, values);
    return rows[0];
  } catch (error) {
    console.error("❌ Error in upsertRecord:", { table, record, error });
    throw error;
  }
};

// 📝 Log sync activity
const logSync = async (deviceId, direction, tableName, recordIds = []) => {
  try {
    const query = `
      INSERT INTO sync_logs (device_id, direction, table_name, record_ids, synced_at)
      VALUES ($1, $2, $3, $4, NOW())
    `;
    await pool.query(query, [deviceId, direction, tableName, recordIds]);
  } catch (error) {
    console.error("❌ Error in logSync:", { deviceId, direction, tableName, error });
  }
};

module.exports = {
  getRecordsSinceFromDevices,
  getPairedDeviceIds,
  upsertRecord,
  logSync
};
