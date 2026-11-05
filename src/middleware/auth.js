const { verifyToken } = require('../utils/jwt');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const User = require('../models/User');

/// Yêu cầu Authorization: Bearer <token>. Xác thực xong gắn req.user (đầy đủ record Mongo).
/// Vì token sống rất lâu, việc kiểm tra tokenVersion cho phép "đăng xuất khỏi mọi thiết bị"
/// (đổi mật khẩu / thu hồi) mà không cần token hết hạn tự nhiên.
const requireAuth = asyncHandler(async (req, res, next) => {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) throw ApiError.unauthorized('Thiếu token xác thực.');

  let payload;
  try {
    payload = verifyToken(token);
  } catch (err) {
    throw ApiError.unauthorized('Token không hợp lệ hoặc đã hết hạn.');
  }

  const user = await User.findById(payload.sub);
  if (!user) throw ApiError.unauthorized('Tài khoản không còn tồn tại.');
  if ((user.tokenVersion ?? 0) !== (payload.tokenVersion ?? 0)) {
    throw ApiError.unauthorized('Token đã bị thu hồi. Vui lòng đăng nhập lại.');
  }

  req.user = user;
  next();
});

/// Giống requireAuth nhưng không bắt buộc — nếu có token hợp lệ thì gắn req.user,
/// không có/ sai thì vẫn cho qua (dùng cho endpoint AI có thể gọi ẩn danh nếu muốn mở rộng sau).
const optionalAuth = asyncHandler(async (req, res, next) => {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return next();
  try {
    const payload = verifyToken(token);
    const user = await User.findById(payload.sub);
    if (user && (user.tokenVersion ?? 0) === (payload.tokenVersion ?? 0)) {
      req.user = user;
    }
  } catch (_) {
    // bỏ qua — coi như không xác thực
  }
  next();
});

module.exports = { requireAuth, optionalAuth };
