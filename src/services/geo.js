const Place = require('../models/Place');

/// Truy vấn địa điểm trong bán kính [radiusKm] quanh [lat,lng], sắp theo khoảng cách gần dần.
/// Trả kèm distanceMeters (do $geoNear tính) để client hiển thị "cách bạn x km".
async function findNearby({ lat, lng, radiusKm, filter = {} }) {
  const pipeline = [
    {
      $geoNear: {
        near: { type: 'Point', coordinates: [lng, lat] },
        distanceField: 'distanceMeters',
        maxDistance: radiusKm * 1000,
        spherical: true,
        query: { isActive: true, ...filter },
      },
    },
    { $sort: { distanceMeters: 1 } },
  ];
  return Place.aggregate(pipeline);
}

/// Truy vấn theo khu vực hành chính (tỉnh/thành, tuỳ chọn quận/huyện).
async function findByArea({ province, city, filter = {} }) {
  const query = { isActive: true, province, ...filter };
  if (city) query.city = city;
  return Place.find(query).sort({ rating: -1 }).lean();
}

/// Danh sách khu vực hiện có dữ liệu — phục vụ UI "chọn tỉnh/thành để tải".
async function listAreas() {
  return Place.aggregate([
    { $match: { isActive: true } },
    { $group: { _id: { province: '$province', city: '$city' }, count: { $sum: 1 } } },
    { $project: { _id: 0, province: '$_id.province', city: '$_id.city', placeCount: '$count' } },
    { $sort: { province: 1, city: 1 } },
  ]);
}

/// Áp bộ lọc giá/loại món/đánh giá dùng chung cho các endpoint tải dữ liệu.
function buildPlaceFilter({ priceMin, priceMax, foodTypes, minRating }) {
  const filter = {};
  if (priceMin != null || priceMax != null) {
    if (priceMax != null) filter.priceMin = { $lte: priceMax };
    if (priceMin != null) filter.priceMax = { $gte: priceMin };
  }
  if (foodTypes && foodTypes.length > 0) {
    filter.foodTypes = { $in: foodTypes };
  }
  if (minRating != null) {
    filter.rating = { $gte: minRating };
  }
  return filter;
}

module.exports = { findNearby, findByArea, listAreas, buildPlaceFilter };
