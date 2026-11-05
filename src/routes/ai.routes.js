const express = require('express');
const rateLimit = require('express-rate-limit');
const { suggest } = require('../controllers/aiController');
const { optionalAuth } = require('../middleware/auth');

const router = express.Router();

// AI (đặc biệt provider trả phí theo lượt gọi) nên giới hạn tốc độ để tránh phát sinh chi phí ngoài ý muốn.
const aiLimiter = rateLimit({ windowMs: 60 * 1000, max: 12, standardHeaders: true, legacyHeaders: false });

router.post('/suggest', aiLimiter, optionalAuth, suggest);

module.exports = router;
