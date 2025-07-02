const { v4: uuidv4 } = require('uuid');
const pool = require('../config/db');

// POST /api/getQRCode
exports.getQRCode = async (req, res) => {
  const { deviceid, devicename, tenantid } = req.body;

  if (!deviceid || !devicename || !tenantid) {
    return res.status(400).json({ error: 'Missing parameters' });
  }

  const token = uuidv4();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

  try {
    await pool.query(
      `INSERT INTO paired_devices (token, device_id, device_name, tenant_id, expires_at)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (device_id) DO UPDATE SET token = EXCLUDED.token, expires_at = EXCLUDED.expires_at`,
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

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const result = await client.query(
      `SELECT * FROM paired_devices WHERE token = $1 AND expires_at > NOW()`,
      [token]
    );

    if (result.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Invalid or expired token' });
    }

    const original = result.rows[0];

    if (original.tenant_id !== new_device_tenant) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Tenant mismatch' });
    }

    if (original.device_id === new_device_id) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Device cannot pair with itself' });
    }

    const [deviceId1, deviceId2] = [original.device_id, new_device_id].sort();

    // Check if already paired
    const checkExisting = await client.query(
      `SELECT 1 FROM device_pairs WHERE device_id_1 = $1 AND device_id_2 = $2`,
      [deviceId1, deviceId2]
    );

    if (checkExisting.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Devices are already paired' });
    }

    // Insert or update new device in paired_devices
    await client.query(
      `INSERT INTO paired_devices (token, device_id, device_name, tenant_id, expires_at)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (device_id) DO UPDATE SET device_name = EXCLUDED.device_name, expires_at = EXCLUDED.expires_at`,
      [uuidv4(), new_device_id, new_device_name, new_device_tenant, original.expires_at]
    );

    // Create device pair
    await client.query(
      `INSERT INTO device_pairs (device_id_1, device_id_2) VALUES ($1, $2)`,
      [deviceId1, deviceId2]
    );

    // Optional: delete the used token
    await client.query(`DELETE FROM paired_devices WHERE token = $1`, [token]);

    await client.query('COMMIT');

    return res.status(200).json({ message: 'Device registered and paired successfully' });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error registering new device:', err);
    return res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
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
      SELECT pd.*
      FROM device_pairs dp
      JOIN paired_devices pd ON 
        (dp.device_id_1 = $1 AND dp.device_id_2 = pd.device_id) OR 
        (dp.device_id_2 = $1 AND dp.device_id_1 = pd.device_id)
    `, [deviceId]);

    return res.status(200).json({ pairedDevices: result.rows });
  } catch (err) {
    console.error('Error fetching paired devices:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};


// DELETE /api/unpairDevices
exports.unpairDevices = async (req, res) => {
  const { device_id_1, device_id_2 } = req.body;

  if (!device_id_1 || !device_id_2) {
    return res.status(400).json({ error: 'Both device IDs are required' });
  }

  if (device_id_1 === device_id_2) {
    return res.status(400).json({ error: 'Cannot unpair the same device' });
  }

  const [id1, id2] = [device_id_1, device_id_2].sort();

  try {
    const result = await pool.query(
      `DELETE FROM device_pairs WHERE device_id_1 = $1 AND device_id_2 = $2 RETURNING *`,
      [id1, id2]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Pair not found' });
    }

    return res.status(200).json({ message: 'Devices unpaired successfully' });
  } catch (err) {
    console.error('Error unpairing devices:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
