const mongoose = require('mongoose');

/// Ảnh người dùng đóng góp cho quán + trạng thái kiểm duyệt. Chỉ ảnh `approved` mới nằm trong Place.imageUrls (công khai).
///  - approved: hiển thị công khai      - pending: chờ duyệt (chỉ người tải thấy)
///  - hidden:   bị ẩn do bị báo cáo nhiều  - rejected: bị từ chối (AI hoặc người duyệt), file đã xoá
/// Lưu người tải + thời điểm + lý do để truy vết khi có khiếu nại (xem services/photoPolicy.js).
const photoSchema = new mongoose.Schema(
  {
    place: { type: mongoose.Schema.Types.ObjectId, ref: 'Place', required: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    url: { type: String, required: true, unique: true },
    status: { type: String, enum: ['approved', 'pending', 'hidden', 'rejected'], required: true },
    distanceMeters: { type: Number, default: null }, // khoảng cách từ người tải tới quán lúc tải (nếu app gửi vị trí)
    moderation: {
      method: { type: String }, // ai | presence | trusted | manual | report
      verdict: { type: String },
      reason: { type: String },
    },
    reports: [
      {
        _id: false,
        user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        reason: { type: String, enum: ['not_this_place', 'inappropriate', 'spam', 'other'] },
        createdAt: { type: Date, default: Date.now },
      },
    ],
  },
  { timestamps: true },
);

photoSchema.index({ place: 1, url: 1 });
photoSchema.index({ status: 1, createdAt: 1 });
photoSchema.index({ user: 1 });

module.exports = mongoose.model('PlacePhoto', photoSchema);
