const pool = require("../config/db");

// ✅ Get admin by email
const findAdminByEmail = async (email) => {
  const result = await pool.query("SELECT * FROM admins WHERE email = $1", [email]);
  return result.rows[0];
};

// ✅ Create new admin
const createAdmin = async (name, email, hashedPassword) => {
  const result = await pool.query(
    "INSERT INTO admins (name, email, password) VALUES ($1, $2, $3) RETURNING *",
    [name, email, hashedPassword]
  );
  return result.rows[0];
};

// ✅ Get admin by ID
const findAdminById = async (id) => {
  const result = await pool.query("SELECT * FROM admins WHERE id = $1", [id]);
  return result.rows[0];
};

// ✅ Get all admins
const findAllAdmins = async () => {
  const result = await pool.query("SELECT * FROM admins ORDER BY id ASC");
  return result.rows;
};

// ✅ Update admin by ID
const updateAdminById = async (id, { name, email, password }) => {
  const result = await pool.query(
    `UPDATE admins SET 
      name = COALESCE($1, name), 
      email = COALESCE($2, email), 
      password = COALESCE($3, password)
     WHERE id = $4
     RETURNING *`,
    [name, email, password, id]
  );
  return result.rows[0]; // returns updated row or undefined
};

// ✅ Delete admin by ID
const deleteAdminById = async (id) => {
  const result = await pool.query("DELETE FROM admins WHERE id = $1", [id]);
  return result.rowCount > 0; // true if deletion happened
};

module.exports = {
  findAdminByEmail,
  createAdmin,
  findAdminById,
  findAllAdmins,
  updateAdminById,
  deleteAdminById,
};
