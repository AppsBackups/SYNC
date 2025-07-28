const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const {
  findAdminByEmail,
  createAdmin,
  findAdminById,
  findAllAdmins,
  updateAdminById,
  deleteAdminById,
} = require("../models/adminModel");

// 🔐 Signup
const signup = async (req, res) => {
  const { name, email, password } = req.body;
  try {
    const existing = await findAdminByEmail(email);
    if (existing) return res.status(400).json({ message: "Email already registered" });

    const hashedPassword = await bcrypt.hash(password, 10);
    const newAdmin = await createAdmin(name, email, hashedPassword);
    res.status(201).json({ message: "Admin registered", admin: newAdmin });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// 🔐 Login
const login = async (req, res) => {
  const { email, password } = req.body;
  try {
    const admin = await findAdminByEmail(email);
    if (!admin) return res.status(404).json({ message: "Admin not found" });

    const isMatch = await bcrypt.compare(password, admin.password);
    if (!isMatch) return res.status(401).json({ message: "Invalid credentials" });

    const token = jwt.sign({ id: admin.id }, process.env.JWT_SECRET, { expiresIn: "1d" });
    res.json({ message: "Login successful", token, admin });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// 📄 Get all admins
const getAllAdmins = async (req, res) => {
  try {
    const admins = await findAllAdmins();
    res.json(admins);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// 📄 Get admin by ID
const getAdminById = async (req, res) => {
  try {
    const admin = await findAdminById(req.params.id);
    if (!admin) return res.status(404).json({ message: "Admin not found" });
    res.json(admin);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// ✏️ Update admin
const updateAdmin = async (req, res) => {
  const { name, email, password } = req.body;
  try {
    let hashedPassword = null;
    if (password) {
      hashedPassword = await bcrypt.hash(password, 10);
    }

    const updatedAdmin = await updateAdminById(req.params.id, {
      name,
      email,
      password: hashedPassword,
    });

    if (!updatedAdmin) return res.status(404).json({ message: "Admin not found" });

    res.json({ message: "Admin updated", admin: updatedAdmin });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// ❌ Delete admin
const deleteAdmin = async (req, res) => {
  try {
    const deleted = await deleteAdminById(req.params.id);
    if (!deleted) return res.status(404).json({ message: "Admin not found" });

    res.json({ message: "Admin deleted successfully" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

module.exports = {
  signup,
  login,
  getAllAdmins,
  getAdminById,
  updateAdmin,
  deleteAdmin,
};
