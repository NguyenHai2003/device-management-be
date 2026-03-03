const express = require('express');
const monitorController = require('../controllers/monitorController');

const router = express.Router();

// Define SSE route for real-time system metrics tracking
router.get('/system-metrics', monitorController.streamMetrics);

module.exports = router;
