const mongoose = require('mongoose');

/// Đánh giá + bình luận của người dùng về một quán. Mỗi người chỉ có MỘT đánh giá cho mỗi quán (gửi lại = cập nhật).
/// Kết quả phân tích cảm xúc (sentiment/aspects/keywords) được tính lúc lưu và lưu kèm để tóm tắt nhanh, không phải
/// phân tích lại mỗi lần xem — xem services/sentiment.js.
const reviewSchema = new mongoose.Schema(
  {
    place: { type: mongoose.Schema.Types.ObjectId, ref: 'Place', required: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    rating: { type: Number, required: true, min: 1, max: 5 },
    comment: { type: String, default: '', maxlength: 1000, trim: true },
    photos: { type: [String], default: [] },
    sentiment: {
      label: { type: String, enum: ['positive', 'neutral', 'negative'] },
      score: Number,
      source: { type: String, enum: ['text', 'rating', 'none'] },
    },
    aspects: { food: Number, price: Number, service: Number, ambience: Number },
    keywords: [{ _id: false, term: String, polarity: { type: String, enum: ['positive', 'negative'] } }],
  },
  { timestamps: true },
);

reviewSchema.index({ place: 1, user: 1 }, { unique: true });
reviewSchema.index({ place: 1, createdAt: -1 });

module.exports = mongoose.model('Review', reviewSchema);
