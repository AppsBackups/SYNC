const CompanyImage = require('../models/companyImageModel');
const path = require('path');

exports.uploadCompanyImage = async (req, res) => {
  try {
    const { global_id } = req.body;
    if (!req.file || !global_id) {
      return res.status(400).json({ message: 'global_id and image file are required' });
    }

    // Construct relative path
    const image_path = `/uploads/${req.file.filename}`;

    // Save path in DB
    const image = await CompanyImage.create(global_id, image_path);

    // Return the path
    res.json({ message: 'Image uploaded successfully', global_id: image.global_id, image_path });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

exports.getCompanyImage = async (req, res) => {
  try {
    const { global_id } = req.params;
    const image = await CompanyImage.findByGlobalId(global_id);

    if (!image) return res.status(404).json({ message: 'Image not found' });

    const imagePath = path.join(__dirname, '../', image.image_url);
    res.sendFile(imagePath);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};
