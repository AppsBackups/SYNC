const pool = require("../config/db");

const getRecordsSince = async (table, timestamp) => {
  if (!table || !timestamp) throw new Error("Missing table or timestamp");

  const query = `
    SELECT * FROM "${table}"
    WHERE "last_modified" > $1
    ORDER BY "last_modified" ASC
  `;
  const { rows } = await pool.query(query, [timestamp]);
  return rows;
};


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
      WHERE "${table}"."last_modified" <= EXCLUDED."last_modified"
      RETURNING *;
    `;

    const { rows } = await pool.query(query, values);
    return rows[0];
  } catch (error) {
    console.error("❌ Error in upsertRecord:", { table, record, error });
    throw error;
  }
};

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
  getRecordsSince,
  upsertRecord,
  logSync,
};
