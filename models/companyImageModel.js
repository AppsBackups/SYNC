const pool = require('../config/db'); // your pg Pool instance

const CompanyImage = {
  create: async (global_id, image_url) => {
    const query = `
      INSERT INTO company_images (global_id, image_url)
      VALUES ($1, $2)
      ON CONFLICT (global_id)
      DO UPDATE SET image_url = $2, created_at = NOW()
      RETURNING *;
    `;
    const result = await pool.query(query, [global_id, image_url]);
    return result.rows[0];
  },

  findByGlobalId: async (global_id) => {
    const query = `SELECT * FROM company_images WHERE global_id = $1`;
    const result = await pool.query(query, [global_id]);
    return result.rows[0];
  }
};

module.exports = CompanyImage;
