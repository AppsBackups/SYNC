const express = require("express");
const router = express.Router();

const {
  signup,
  login,
  getAllAdmins,
  getAdminById,
  updateAdmin,
  deleteAdmin,
} = require("../controllers/authController"); // ✅ imported all from same controller

// Auth routes
router.post("/signup", signup);
router.post("/login", login);

// CRUD routes
router.get("/", getAllAdmins);
router.get("/:id", getAdminById);
router.put("/:id", updateAdmin);
router.delete("/:id", deleteAdmin);

module.exports = router;
