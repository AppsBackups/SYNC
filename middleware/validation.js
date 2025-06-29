module.exports.validateRequest = (req, res, next) => {
  if (!req.body || typeof req.body !== 'object') {
    return res.status(400).json({ error: 'Invalid request format' });
  }
  if (!req.body.deviceId) {
    return res.status(400).json({ error: 'deviceId is required' });
  }
  if (!req.body.lastSyncTimestamp) {
    return res.status(400).json({ error: 'lastSyncTimestamp is required' });
  }
  next();
};