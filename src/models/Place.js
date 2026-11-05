const mongoose = require('mongoose');

/// Địa điểm ăn uống — dữ liệu THẬT trong MongoDB (thay cho mock data phía app).
/// `location` dùng GeoJSON Point + index 2dsphere để truy vấn theo bán kính (radius)
/// hoặc theo khu vực (tỉnh/thành, quận/huyện) qua $geoNear / $geoWithin.
///
/// `sourceUpdatedAt` đánh dấu lần dữ liệu này được xác nhận/cập nhật gần nhất từ
/// nguồn thật (ví dụ lần đồng bộ có kết nối wifi gần nhất phía admin/pipeline nội dung)
/// — client dùng để đồng bộ chênh lệch (?since=) thay vì tải lại toàn bộ mỗi lần.
const placeSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    foodTypes: { type: [String], default: [], index: true },

    priceMin: { type: Number, required: true, min: 0 },
    priceMax: { type: Number, required: true, min: 0 },

    rating: { type: Number, default: 0, min: 0, max: 5 },
    reviewCount: { type: Number, default: 0 },

    address: { type: String, required: true },
    province: { type: String, required: true, index: true }, // Tỉnh/Thành phố
    city: { type: String, default: '' }, // Quận/Huyện

    location: {
      type: { type: String, enum: ['Point'], default: 'Point' },
      coordinates: { type: [Number], required: true }, // [lng, lat]
    },

    imageUrls: { type: [String], default: [] },
    openingHours: { type: String, default: null },

    // Nguồn gốc dữ liệu — phục vụ minh bạch/kiểm soát chất lượng dữ liệu thật.
    source: { type: String, enum: ['seed', 'partner_feed', 'admin', 'user_submitted', 'osm', 'geoapify'], default: 'seed' },
    isActive: { type: Boolean, default: true },
    sourceUpdatedAt: { type: Date, default: Date.now },
    // true cho dữ liệu nhập tự động còn thiếu giá/đánh giá/ảnh thật (xem scripts/importPlaces.js)
    // — dùng để truy vấn "các địa điểm cần rà soát thủ công" từ phía quản trị.
    needsReview: { type: Boolean, default: false },
    // Định danh trong nguồn ngoài (vd "osm:node/123") — dùng để nhập lại nhiều lần mà không bị trùng.
    externalId: { type: String, unique: true, sparse: true },
  },
  { timestamps: true },
);

placeSchema.index({ location: '2dsphere' });
placeSchema.index({ province: 1, city: 1 });

placeSchema.methods.toClientJSON = function toClientJSON(extra = {}) {
  const [lng, lat] = this.location.coordinates;
  return {
    id: this._id.toString(),
    name: this.name,
    description: this.description,
    foodTypes: this.foodTypes,
    priceMin: this.priceMin,
    priceMax: this.priceMax,
    rating: this.rating,
    reviewCount: this.reviewCount,
    address: this.address,
    province: this.province,
    city: this.city,
    latitude: lat,
    longitude: lng,
    imageUrls: this.imageUrls,
    openingHours: this.openingHours,
    needsReview: !!this.needsReview,
    updatedAt: this.updatedAt,
    ...extra,
  };
};

module.exports = mongoose.model('Place', placeSchema);
