const express = require('express');
const rateLimit = require('express-rate-limit');
const { register, login, me, revokeAllTokens } = require('../controllers/authController');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// Giới hạn tốc độ riêng cho đăng nhập/đăng ký để chống dò mật khẩu.
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, standardHeaders: true, legacyHeaders: false });

router.post('/register', authLimiter, register);
router.post('/login', authLimiter, login);
router.get('/me', requireAuth, me);
router.post('/revoke-all', requireAuth, revokeAllTokens);

module.exports = router;
