const express = require('express');
const router = express.Router();
const planController = require('../controllers/plan');


router.post('/save-plan', planController.saveUserPlan);
router.post('/recover-plan', planController.recoverDevice);

router.get('/plans', planController.getAllPlans);

module.exports = router;
