const pool = require("../config/db"); // your pg Pool instance

// Get all tables in the "public" schema
const getAllTables = async () => {
  const result = await pool.query(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
    ORDER BY table_name;
  `);
  return result.rows.map(r => r.table_name);
};

// Get all rows from a specific table
const getTableData = async (tableName) => {
  // IMPORTANT: never directly interpolate user input into SQL (risk of SQL injection)
  // Postgres does not allow parameter substitution for identifiers (like table names).
  // So safest way: whitelist table names from getAllTables().
  
  const tables = await getAllTables();
  if (!tables.includes(tableName)) {
    throw new Error("Invalid table name");
  }

  const result = await pool.query(`SELECT * FROM "${tableName}"`);
  return result.rows;
};

module.exports = {
  getAllTables,
  getTableData,
};
