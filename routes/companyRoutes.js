const express = require('express');
const { createCompany, uploadMiddleware } = require( "../controllers/companyController");

const router = express.Router();

router.post("/company", uploadMiddleware, createCompany);

module.exports = router;
