const jwt = require('jsonwebtoken');
const env = require('../config/env');

// Ký một access token sống rất lâu (mặc định 365 ngày, xem JWT_EXPIRES_IN) —
// mục tiêu: người dùng đăng nhập/đăng ký MỘT LẦN, sau đó thiết bị tự xác thực
// cục bộ bằng token đã lưu, dùng được cả khi offline, không cần gọi lại server
// cho tới khi cần đồng bộ dữ liệu hoặc dùng tính năng AI (lúc đó mới cần mạng).
function signToken(user) {
  return jwt.sign(
    { sub: user._id.toString(), tokenVersion: user.tokenVersion ?? 0 },
    env.jwtSecret,
    { expiresIn: env.jwtExpiresIn },
  );
}

function verifyToken(token) {
  return jwt.verify(token, env.jwtSecret);
}

module.exports = { signToken, verifyToken };
