const pool = require('../config/db');
const nodemailer = require('nodemailer');
require('dotenv').config(); // make sure this is called early


exports.saveUserPlan = async (req, res) => {
  const { plan_id, plan_type, price, user_email, purchase_date, teanut } = req.body;

  if (!plan_id || !plan_type || !price || !user_email || !purchase_date || !teanut) {
    return res.status(400).json({ error: 'All fields are required' });
  }

  const deviceLimits = {
    // Basic: 1,
    // Pro: 3,
    // Premium: 5,n
    single_device: 0,
    three_devices: 2,
    eight_devices: 7
  };

  const device_limit = deviceLimits[plan_id] || 1;

  try {
    // Save to database
    const result = await pool.query(
      `INSERT INTO user_plans (
        user_email, plan_id, plan_type, price, purchase_date, device_limit, teanut
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *`,
      [user_email, plan_id, plan_type, price, purchase_date, device_limit, teanut]
    );

    // Email configuration
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
      }
    });

    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: user_email,
      subject: 'Your Plan Details',
      text: `Thanks for your subscription!\n\nPlan: ${plan_type}\nTeanut: ${teanut}\n\nUse this code for device verification or access.`
    };

    await transporter.sendMail(mailOptions);

    res.status(201).json({ success: true, plan: result.rows[0] });
  } catch (error) {
    console.error('Save Plan Error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};



exports.recoverDevice = async (req, res) => {
  const { user_email, teanut } = req.body;

  if (!user_email || !teanut) {
    return res.status(400).json({ error: 'Email and tenant ID are required' });
  }

  try {
    // 1. Verify tenantId (teanut) with user_email
    const result = await pool.query(
      `SELECT * FROM user_plans WHERE user_email = $1 AND teanut = $2`,
      [user_email, teanut]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'No matching plan found for this email and tenant ID' });
    }

    const plan = result.rows[0];

    // 2. Send confirmation email
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
      }
    });

    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: user_email,
      subject: 'Tenant ID Recovery Confirmation',
      text: `Your Tenant ID (${teanut}) is now active on a new device.\n\nIf this wasn't you, please contact support.`
    };

    await transporter.sendMail(mailOptions);

    // 3. Return response with plan info
    res.status(200).json({
      success: true,
      message: 'Recovery confirmed and email sent.',
      plan
    });

  } catch (error) {
    console.error('Recovery Error:', error);
    res.status(500).json({ error: 'Server error during recovery' });
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
