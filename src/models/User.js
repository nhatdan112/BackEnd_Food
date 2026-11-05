const mongoose = require('mongoose');

/// Người dùng — đăng ký/đăng nhập MỘT LẦN; token phát ra sống rất lâu (xem utils/jwt.js)
/// nên app phía client (Flutter) chỉ cần lưu token cục bộ (flutter_secure_storage) và có
/// thể coi là "đã đăng nhập" hoàn toàn offline, không cần gọi lại server để xác nhận.
const preferenceSchema = new mongoose.Schema(
  {
    foodTypes: { type: [String], default: [] },
    priceMin: { type: Number, default: 0 },
    priceMax: { type: Number, default: 500000 },
    maxDistanceKm: { type: Number, default: 5 },
    minRating: { type: Number, default: 0 },
  },
  { _id: false },
);

const userSchema = new mongoose.Schema(
  {
    fullName: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    avatarUrl: { type: String, default: null },
    location: { type: String, default: null }, // mô tả dạng chữ, vd "Đống Đa, Hà Nội"

    preferences: { type: preferenceSchema, default: () => ({}) },
    favorites: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Place' }],

    // Tăng số này để thu hồi TẤT CẢ token đã phát (đổi mật khẩu, đăng xuất mọi thiết bị...).
    tokenVersion: { type: Number, default: 0 },
  },
  { timestamps: true },
);

userSchema.methods.toPublicJSON = function toPublicJSON() {
  return {
    id: this._id.toString(),
    fullName: this.fullName,
    email: this.email,
    avatarUrl: this.avatarUrl,
    location: this.location,
    preferences: this.preferences,
    favorites: this.favorites,
    createdAt: this.createdAt,
  };
};

module.exports = mongoose.model('User', userSchema);
