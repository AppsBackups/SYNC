const { v4: uuidv4 } = require('uuid');
const pool = require('../config/db');

// POST /api/getQRCode
exports.getQRCode = async (req, res) => {
  const { deviceid, devicename, tenantid } = req.body;

  if (!deviceid || !devicename || !tenantid) {
    return res.status(400).json({ error: 'Missing parameters' });
  }

  const token = uuidv4();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes from now

  try {
    await pool.query(
      `INSERT INTO paired_devices (token, device_id, device_name, tenant_id, expires_at)
       VALUES ($1, $2, $3, $4, $5)`,
      [token, deviceid, devicename, tenantid, expiresAt]
    );

    return res.status(200).json({ token, expiresAt });
  } catch (err) {
    console.error('Error generating QR code:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

// POST /api/registerNewDevice
exports.registerNewDevice = async (req, res) => {
  const { token, new_device_id, new_device_name, new_device_tenant } = req.body;

  if (!token || !new_device_id || !new_device_name || !new_device_tenant) {
    return res.status(400).json({ error: 'Missing parameters' });
  }

  try {
    const result = await pool.query(
      `SELECT * FROM paired_devices WHERE token = $1 AND expires_at > NOW()`,
      [token]
    );

    if (result.rows.length === 0) {
      return res.status(400).json({ error: 'Invalid or expired token' });
    }

    const original = result.rows[0];

    if (original.tenant_id !== new_device_tenant) {
      return res.status(403).json({ error: 'Tenant mismatch' });
    }

    if (original.device_id === new_device_id) {
      return res.status(400).json({ error: 'Device cannot pair with itself' });
    }

    // Check for existing pair in either direction
    const checkExisting = await pool.query(
      `SELECT * FROM device_pairs 
       WHERE (device_id_1 = $1 AND device_id_2 = $2) 
          OR (device_id_1 = $2 AND device_id_2 = $1)`,
      [original.device_id, new_device_id]
    );

    if (checkExisting.rows.length > 0) {
      return res.status(400).json({ error: 'Devices are already paired' });
    }

    // Insert the new device into paired_devices
    await pool.query(
      `INSERT INTO paired_devices (token, device_id, device_name, tenant_id, expires_at)
       VALUES ($1, $2, $3, $4, $5)`,
      [uuidv4(), new_device_id, new_device_name, new_device_tenant, original.expires_at]
    );

    // Insert into device_pairs
    await pool.query(
      `INSERT INTO device_pairs (device_id_1, device_id_2) VALUES ($1, $2)`,
      [original.device_id, new_device_id]
    );

    return res.status(200).json({ message: 'New device registered and paired successfully' });

  } catch (err) {
    console.error('Error registering new device:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};



// GET /api/pairedDevices/:deviceId

// GET /api/pairedDevices/:deviceId
exports.getPairedDevices = async (req, res) => {
  const { deviceId } = req.params;

  if (!deviceId) {
    return res.status(400).json({ error: 'Device ID is required' });
  }

  try {
    const result = await pool.query(`
      SELECT 
        CASE 
          WHEN dp.device_id_1 = $1 THEN pd2.device_id
          ELSE pd1.device_id
        END AS device_id,
        CASE 
          WHEN dp.device_id_1 = $1 THEN pd2.device_name
          ELSE pd1.device_name
        END AS device_name,
        CASE 
          WHEN dp.device_id_1 = $1 THEN pd2.tenant_id
          ELSE pd1.tenant_id
        END AS tenant_id
      FROM device_pairs dp
      LEFT JOIN paired_devices pd1 ON pd1.device_id = dp.device_id_1
      LEFT JOIN paired_devices pd2 ON pd2.device_id = dp.device_id_2
      WHERE dp.device_id_1 = $1 OR dp.device_id_2 = $1
    `, [deviceId]);

    return res.status(200).json({ pairedDevices: result.rows });
  } catch (err) {
    console.error('Error fetching paired devices:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};