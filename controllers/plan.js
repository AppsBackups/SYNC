const pool = require('../config/db');


exports.saveUserPlan = async (req, res) => {
  const { plan_id, plan_type, price, user_email, purchase_date } = req.body;

  if (!plan_id || !plan_type || !price || !user_email || !purchase_date) {
    return res.status(400).json({ error: 'All fields are required' });
  }

  // Define device limits by plan type
  const deviceLimits = {
    Basic: 1,
    Pro: 3,
    Premium: 5
  };

  const device_limit = deviceLimits[plan_type] || 1; // fallback to 1

  try {
    const result = await pool.query(
      `INSERT INTO user_plans (
        user_email, plan_id, plan_type, price, purchase_date, device_limit
      ) VALUES ($1, $2, $3, $4, $5, $6 )
      RETURNING *`,
      [user_email, plan_id, plan_type, price, purchase_date, device_limit]
    );

    res.status(201).json({ success: true, plan: result.rows[0] });
  } catch (error) {
    console.error('Save Plan Error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};




exports.getAllPlans = async (req, res) => {
  try {
    const result = await pool.query(`SELECT * FROM user_plans ORDER BY created_at DESC`);
    res.json({ plans: result.rows });
  } catch (error) {
    console.error('Get Plans Error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};
