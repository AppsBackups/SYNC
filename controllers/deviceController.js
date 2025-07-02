const { v4: uuidv4 } = require("uuid");
const pool = require("../config/db");

// 1. Generate QR Code Token
exports.getQRCode = async (req, res) => {
  const { deviceid, devicename, tenantid } = req.body;

  if (!deviceid || !devicename || !tenantid) {
    return res.status(400).json({ error: "Missing parameters" });
  }

  // Ensure device exists
  await pool.query(
    `INSERT INTO devices (id, name, tenant_id)
     VALUES ($1, $2, $3)
     ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name`,
    [deviceid, devicename, tenantid]
  );

  const token = uuidv4();
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 mins

  await pool.query(
    `INSERT INTO qr_tokens (token, device_id, tenant_id, expires_at)
     VALUES ($1, $2, $3, $4)`,
    [token, deviceid, tenantid, expiresAt]
  );

  return res.json({ token, expiresAt });
};

// 2. Register New Device via Scanned Token
exports.registerNewDevice = async (req, res) => {
  const { token, newDeviceId, newDeviceName, newTenantId } = req.body;

  if (!token || !newDeviceId || !newDeviceName || !newTenantId) {
    return res.status(400).json({ error: "Missing parameters" });
  }

  // 1. Check token validity and expiration
  const { rows } = await pool.query(
    `SELECT * FROM qr_tokens WHERE token = $1 AND expires_at > NOW()`,
    [token]
  );

  if (rows.length === 0) {
    return res.status(400).json({ error: "Invalid or expired token" });
  }

  const qr = rows[0];

  // 2. Avoid pairing with self
  if (qr.device_id === newDeviceId) {
    return res.status(400).json({ error: "Cannot pair with the same device" });
  }

  // 3. Ensure tenant matches
  if (qr.tenant_id !== newTenantId) {
    return res.status(403).json({ error: "Tenant mismatch" });
  }

  // 4. Sort device IDs for consistent pair ordering
  const [id1, id2] = [qr.device_id, newDeviceId].sort();

  // 5. Check if already paired
  const existingPair = await pool.query(
    `SELECT 1 FROM paired_devices WHERE device_id_1 = $1 AND device_id_2 = $2`,
    [id1, id2]
  );

  if (existingPair.rows.length > 0) {
    return res.status(409).json({ error: "Devices already paired" });
  }

  // 6. Register new device (or update name if exists)
  await pool.query(
    `INSERT INTO devices (id, name, tenant_id)
     VALUES ($1, $2, $3)
     ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name`,
    [newDeviceId, newDeviceName, newTenantId]
  );

  // 7. Save pairing
  await pool.query(
    `INSERT INTO paired_devices (device_id_1, device_id_2)
     VALUES ($1, $2)`,
    [id1, id2]
  );

  return res.json({ message: "Device paired successfully" });
};


// 3. Get List of Paired Devices with Last Sync Info
exports.getPairedDevices = async (req, res) => {
  const { deviceId } = req.params;

  if (!deviceId) {
    return res.status(400).json({ error: "Missing device ID" });
  }

  const result = await pool.query(
    `
    SELECT d.id, d.name, d.tenant_id, pd.last_sync
    FROM paired_devices pd
    JOIN devices d
      ON (d.id = pd.device_id_1 AND pd.device_id_2 = $1)
      OR (d.id = pd.device_id_2 AND pd.device_id_1 = $1)
    WHERE d.id != $1
    `,
    [deviceId]
  );

  return res.json({ pairedDevices: result.rows });
};
