const pool = require("../config/db");

// Get records modified after a given timestamp
const getRecordsSince = async (table, timestamp, excludeIds = []) => {
  try {
    if (!table) throw new Error("Table name is required");
    if (!timestamp) throw new Error("Timestamp is required");

    const params = [timestamp];
    let query = `SELECT * FROM "${table}" WHERE "last_modified" > $1`;

    if (excludeIds.length > 0) {
      if (!Array.isArray(excludeIds)) {
        throw new Error("excludeIds must be an array");
      }
      const idParams = excludeIds.map((_, i) => `$${i + 2}`).join(",");
      query += ` AND "global_id" NOT IN (${idParams})`;
      params.push(...excludeIds);
    }

    query += ' ORDER BY "last_modified" ASC';
    const { rows } = await pool.query(query, params);
    return rows;
  } catch (error) {
    console.error("❌ Error in getRecordsSince:", { table, error });
    throw error;
  }
};

// Insert or update a record using UPSERT (based on global_id)
const upsertRecord = async (table, record) => {
  try {
    if (!table) throw new Error("Table name is required");
    if (!record || typeof record !== "object") {
      throw new Error("Record must be an object");
    }
    if (!record.global_id) {
      throw new Error("Record must have a global_id property");
    }

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

module.exports = {
  getRecordsSince,
  upsertRecord
};
