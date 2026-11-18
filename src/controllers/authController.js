const bcrypt = require('bcryptjs');
const User = require('../models/User');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { signToken } = require('../utils/jwt');

/// Đăng ký — chỉ thực hiện một lần cho mỗi thiết bị/người dùng. Token trả về sống
/// rất lâu; client (Flutter) lưu cục bộ và dùng lại mãi cho tới khi người dùng chủ
/// động đăng xuất, không cần gọi API này lần thứ hai.
const register = asyncHandler(async (req, res) => {
  const { fullName, email, password } = req.body;
  if (!fullName || !email || !password) {
    throw ApiError.badRequest('Vui lòng nhập đầy đủ họ tên, email và mật khẩu.');
  }
  if (password.length < 6) {
    throw ApiError.badRequest('Mật khẩu cần tối thiểu 6 ký tự.');
  }

  const existing = await User.findOne({ email: email.toLowerCase() });
  if (existing) throw ApiError.conflict('Email này đã được đăng ký.');

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await User.create({ fullName, email: email.toLowerCase(), passwordHash });

  const token = signToken(user);
  res.status(201).json({ token, user: user.toPublicJSON() });
});

const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) throw ApiError.badRequest('Vui lòng nhập email và mật khẩu.');

  const user = await User.findOne({ email: email.toLowerCase() });
  if (!user) throw ApiError.unauthorized('Email hoặc mật khẩu không đúng.');

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) throw ApiError.unauthorized('Email hoặc mật khẩu không đúng.');

  const token = signToken(user);
  res.json({ token, user: user.toPublicJSON() });
});

/// Gọi khi online để đồng bộ lại hồ sơ (ví dụ đổi tên/ảnh từ thiết bị khác) —
/// KHÔNG bắt buộc để mở app; app vẫn chạy offline với dữ liệu người dùng đã lưu cục bộ.
const me = asyncHandler(async (req, res) => {
  res.json({ user: req.user.toPublicJSON() });
});

/// Thu hồi token hiện tại của người dùng ở MỌI thiết bị (tăng tokenVersion).
/// Dùng khi người dùng chủ động đăng xuất hoặc đổi mật khẩu — không phải hành vi mặc định.
const revokeAllTokens = asyncHandler(async (req, res) => {
  req.user.tokenVersion = (req.user.tokenVersion ?? 0) + 1;
  await req.user.save();
  res.json({ message: 'Đã đăng xuất khỏi mọi thiết bị.' });
});

module.exports = { register, login, me, revokeAllTokens };
