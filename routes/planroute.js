const express = require('express');
const router = express.Router();
const planController = require('../controllers/plan');


router.post('/save-plan', planController.saveUserPlan);

router.get('/plans', planController.getAllPlans);

module.exports = router;
