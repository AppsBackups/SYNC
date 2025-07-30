const { v4: uuidv4 } = require('uuid');
const pool = require('../config/db');
const admin = require('../config/firebase');

// Utility: Normalize pair key
function normalizePairId(id1, id2) {
  return [id1, id2].sort().join('_');
}

// Utility: Send FCM message
async function sendFCM(token, data) {
  try {
    await admin.messaging().send({ token, data });
  } catch (error) {
    console.error('FCM Error:', error);
    throw new Error('Failed to send FCM notification.');
  }
}

exports.initiatePairing = async (req, res) => {
  const { deviceId, fcmToken, deviceName } = req.body;
  if (!deviceId || !fcmToken || !deviceName) {
    return res.status(400).json({ error: 'deviceId, fcmToken, and deviceName are required.' });
  }

  try {
    const token = uuidv4();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 mins

    await pool.query(
      `INSERT INTO pairing_tokens (token, device_id, fcm_token, device_name, status, created_at, expires_at)
       VALUES ($1, $2, $3, $4, 'pending', NOW(), $5)`,
      [token, deviceId, fcmToken, deviceName, expiresAt]
    );

    res.json({ pairingToken: token, expiresIn: 300 });
  } catch (error) {
    console.error('Initiate Pairing Error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

exports.requestPairing = async (req, res) => {
  const { pairingToken, newDeviceId, newDeviceName, newFcmToken } = req.body;

  if (!pairingToken || !newDeviceId || !newDeviceName || !newFcmToken) {
    return res.status(400).json({ error: 'pairingToken, newDeviceId, newDeviceName, newFcmToken required' });
  }

  try {
    const result = await pool.query(
      `SELECT * FROM pairing_tokens WHERE token = $1 AND status = 'pending' AND expires_at > NOW()`,
      [pairingToken]
    );
    if (result.rows.length === 0) {
      return res.status(400).json({ error: 'Invalid or expired pairing token' });
    }

    const initiator = result.rows[0];

    // ✅ Send request to Device A (initiator)
    await sendFCM(initiator.fcm_token, {
      type: 'PAIRING_REQUEST',
      pairingToken,
      newDeviceId,
      newDeviceName,
      requestTimestamp: new Date().toISOString()
    });

    

    // ✅ Store Device B's FCM token for later use during confirmation
    await pool.query(
      `UPDATE pairing_tokens SET new_fcm_token = $1 WHERE token = $2`,
      [newFcmToken, pairingToken]
    );

    res.json({ message: 'Pairing request sent to Device A and verified to Device B' });
  } catch (error) {
    console.error('Request Pairing Error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};


exports.confirmPairing = async (req, res) => {
  const { pairingToken, decision, newDeviceId, newDeviceName } = req.body;

  if (!pairingToken || !decision || !newDeviceId || !newDeviceName) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    const result = await pool.query(
      `SELECT * FROM pairing_tokens WHERE token = $1 AND status = 'pending'`,
      [pairingToken]
    );
    if (result.rows.length === 0) {
      return res.status(400).json({ error: 'Invalid or expired pairing token' });
    }

    const {
      device_id: deviceAId,
      device_name: deviceAName,
      fcm_token: deviceAFcm,
      new_fcm_token: deviceBFcm
    } = result.rows[0];

    if (decision === 'approved') {
      const normalizedPairId = normalizePairId(deviceAId, newDeviceId);

      const existing = await pool.query(
        `SELECT * FROM paired_devices WHERE normalized_pair_id = $1`,
        [normalizedPairId]
      );

      if (existing.rows.length > 0) {
        return res.status(409).json({ error: 'Devices already paired.' });
      }

      await pool.query(
        'UPDATE pairing_tokens SET status = $1 WHERE token = $2',
        ['used', pairingToken]
      );

      await pool.query(
        `INSERT INTO paired_devices (
          device_id, device_name,
          paired_with_device_id, paired_with_device_name,
          paired_at, normalized_pair_id
        ) VALUES ($1, $2, $3, $4, NOW(), $5)`,
        [deviceAId, deviceAName, newDeviceId, newDeviceName, normalizedPairId]
      );

      // ✅ Notify Device A (initiator)
      await sendFCM(deviceAFcm, {
        type: 'PAIRING_CONFIRMED',
        pairedWith: newDeviceId,
        pairedWithName: newDeviceName,
        timestamp: new Date().toISOString()
      });

      // ✅ Notify Device B (requester)
      await sendFCM(deviceBFcm, {
        type: 'PAIRING_CONFIRMED',
        pairedWith: deviceAId,
        pairedWithName: deviceAName,
        timestamp: new Date().toISOString()
      });

      res.json({ success: true, message: 'Devices paired successfully.' });

    } else {
      await pool.query(
        'UPDATE pairing_tokens SET status = $1 WHERE token = $2',
        ['denied', pairingToken]
      );

      // ✅ Notify Device B (requester) about denial
      if (deviceBFcm) {
        await sendFCM(deviceBFcm, {
          type: 'PAIRING_DENIED',
          message: 'Pairing request was denied by the other device.',
          timestamp: new Date().toISOString()
        });
      }

      res.status(403).json({ error: 'Pairing denied.' });
    }
  } catch (error) {
    console.error('Confirm Pairing Error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};










exports.getPairedDevices = async (req, res) => {
  const { deviceId } = req.params;
  if (!deviceId) return res.status(400).json({ error: 'deviceId is required' });

  try {
    const result = await pool.query(
      `SELECT * FROM paired_devices
       WHERE device_id = $1 OR paired_with_device_id = $1`,
      [deviceId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'No paired devices found' });
    }

    const devices = result.rows.map(row => {
      return row.device_id === deviceId
        ? {
            deviceId: row.device_id,
            deviceName: row.device_name,
            pairedWithDeviceId: row.paired_with_device_id,
            pairedWithDeviceName: row.paired_with_device_name,
            pairedAt: row.paired_at
          }
        : {
            deviceId: row.paired_with_device_id,
            deviceName: row.paired_with_device_name,
            pairedWithDeviceId: row.device_id,
            pairedWithDeviceName: row.device_name,
            pairedAt: row.paired_at
          };
    });

    res.json({ pairedDevices: devices });
  } catch (error) {
    console.error('Get Paired Devices Error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

exports.unpairDevices = async (req, res) => {
  const { deviceId, pairedWithDeviceId } = req.body;

  if (!deviceId || !pairedWithDeviceId) {
    return res.status(400).json({ error: 'deviceId and pairedWithDeviceId are required' });
  }

  try {
    const normalizedPairId = normalizePairId(deviceId, pairedWithDeviceId);

    const deleted = await pool.query(
      `DELETE FROM paired_devices WHERE normalized_pair_id = $1`,
      [normalizedPairId]
    );

    if (deleted.rowCount === 0) {
      return res.status(404).json({ error: 'No pairing found to unpair.' });
    }

    res.json({ success: true, message: 'Devices unpaired successfully.' });
  } catch (error) {
    console.error('Unpair Devices Error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};
