const Place = require('../models/Place');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const geo = require('../services/geo');
const { isObjectIdString } = require('../utils/objectId');
const placesImport = require('../services/placesImport');

function parseNumber(value) {
  if (value === undefined || value === null || value === '') return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

/// GET /api/places/:id
const getPlace = asyncHandler(async (req, res) => {
  if (!isObjectIdString(req.params.id)) throw ApiError.notFound('Không tìm thấy địa điểm.');
  const place = await Place.findById(req.params.id);
  if (!place || !place.isActive) throw ApiError.notFound('Không tìm thấy địa điểm.');
  res.json({ place: place.toClientJSON() });
});

/// GET /api/places/nearby?lat=&lng=&radiusKm=&priceMin=&priceMax=&foodTypes=a,b&minRating=
/// Truy vấn "xung quanh vị trí hiện tại" dùng để HIỂN THỊ trên bản đồ (không phải để tải/lưu).
const getNearby = asyncHandler(async (req, res) => {
  const lat = parseNumber(req.query.lat);
  const lng = parseNumber(req.query.lng);
  const radiusKm = parseNumber(req.query.radiusKm) ?? 3;
  if (lat === undefined || lng === undefined) {
    throw ApiError.badRequest('Cần tham số lat, lng.');
  }
  const filter = geo.buildPlaceFilter({
    priceMin: parseNumber(req.query.priceMin),
    priceMax: parseNumber(req.query.priceMax),
    foodTypes: req.query.foodTypes ? String(req.query.foodTypes).split(',') : undefined,
    minRating: parseNumber(req.query.minRating),
  });

  const results = await geo.findNearby({ lat, lng, radiusKm, filter });
  res.json({
    places: results.map((p) => ({
      id: p._id.toString(),
      name: p.name,
      description: p.description,
      foodTypes: p.foodTypes,
      priceMin: p.priceMin,
      priceMax: p.priceMax,
      rating: p.rating,
      reviewCount: p.reviewCount,
      address: p.address,
      province: p.province,
      city: p.city,
      latitude: p.location.coordinates[1],
      longitude: p.location.coordinates[0],
      imageUrls: p.imageUrls,
      openingHours: p.openingHours,
    needsReview: !!p.needsReview,
      distanceMeters: p.distanceMeters,
      updatedAt: p.updatedAt,
    })),
  });
});

/// GET /api/places/by-area?province=&city=
const getByArea = asyncHandler(async (req, res) => {
  const { province, city } = req.query;
  if (!province) throw ApiError.badRequest('Cần tham số province.');
  const filter = geo.buildPlaceFilter({
    priceMin: parseNumber(req.query.priceMin),
    priceMax: parseNumber(req.query.priceMax),
    foodTypes: req.query.foodTypes ? String(req.query.foodTypes).split(',') : undefined,
    minRating: parseNumber(req.query.minRating),
  });
  const results = await geo.findByArea({ province, city, filter });
  res.json({ places: results.map((p) => placeLeanToClient(p)) });
});

function placeLeanToClient(p) {
  return {
    id: p._id.toString(),
    name: p.name,
    description: p.description,
    foodTypes: p.foodTypes,
    priceMin: p.priceMin,
    priceMax: p.priceMax,
    rating: p.rating,
    reviewCount: p.reviewCount,
    address: p.address,
    province: p.province,
    city: p.city,
    latitude: p.location.coordinates[1],
    longitude: p.location.coordinates[0],
    imageUrls: p.imageUrls,
    openingHours: p.openingHours,
    needsReview: !!p.needsReview,
    updatedAt: p.updatedAt,
  };
}

/// POST /api/places/download
/// ĐIỂM DUY NHẤT trả dữ liệu HÀNG LOẠT để client lưu offline — CHỈ được gọi khi
/// người dùng chủ động bấm "Tải xuống" (radius | area | province) ở phía app; server
/// không tự đẩy dữ liệu và không có cơ chế nào khác kích hoạt tải hàng loạt.
/// Hỗ trợ đồng bộ chênh lệch qua `since` (ISO date) để lần tải sau (khi có wifi) chỉ
/// lấy phần đã thay đổi kể từ lần đồng bộ trước, thay vì tải lại toàn bộ.
const downloadData = asyncHandler(async (req, res) => {
  const { mode, lat, lng, radiusKm, province, city, since } = req.body;
  if (!['radius', 'area', 'province'].includes(mode)) {
    throw ApiError.badRequest('mode phải là "radius", "area" hoặc "province".');
  }

  const filter = geo.buildPlaceFilter({
    priceMin: parseNumber(req.body.priceMin),
    priceMax: parseNumber(req.body.priceMax),
    foodTypes: Array.isArray(req.body.foodTypes) ? req.body.foodTypes : undefined,
    minRating: parseNumber(req.body.minRating),
  });
  if (since) {
    const sinceDate = new Date(since);
    if (!Number.isNaN(sinceDate.getTime())) filter.updatedAt = { $gt: sinceDate };
  }

  let results;
  if (mode === 'radius') {
    if (lat === undefined || lng === undefined) throw ApiError.badRequest('Cần lat, lng cho mode "radius".');
    results = await geo.findNearby({ lat, lng, radiusKm: radiusKm || 3, filter });
    results = results.map((p) => ({ ...placeLeanToClient(p), distanceMeters: p.distanceMeters }));
  } else if (mode === 'area') {
    if (!province) throw ApiError.badRequest('Cần province cho mode "area".');
    const docs = await geo.findByArea({ province, city, filter });
    results = docs.map(placeLeanToClient);
  } else {
    if (!province) throw ApiError.badRequest('Cần province cho mode "province".');
    const docs = await geo.findByArea({ province, city: undefined, filter });
    results = docs.map(placeLeanToClient);
  }

  res.json({
    mode,
    syncedAt: new Date().toISOString(),
    count: results.length,
    places: results,
  });
});

/// POST /api/places/import-nearby  { lat, lng, radiusKm?, province? }
/// Lấy quán ăn THẬT quanh vị trí người dùng từ OpenStreetMap (miễn phí, không cần API key),
/// lưu vào MongoDB rồi trả về toàn bộ quán trong bán kính (gồm cả quán đã có từ trước).
/// Chỉ chạy khi client chủ động gọi (người dùng bấm nút) — không có cơ chế tự động nào khác.
const importNearbyPlaces = asyncHandler(async (req, res) => {
  const lat = parseNumber(req.body.lat);
  const lng = parseNumber(req.body.lng);
  if (lat === undefined || lng === undefined || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    throw ApiError.badRequest('Cần lat, lng hợp lệ.');
  }
  const radiusKm = parseNumber(req.body.radiusKm) ?? 2;

  let summary;
  try {
    summary = await placesImport.importNearby({ lat, lng, radiusKm, province: req.body.province });
  } catch (err) {
    console.error('[import-nearby]', err.message);
    throw ApiError.badGateway('Không lấy được dữ liệu từ OpenStreetMap lúc này. Vui lòng thử lại sau ít phút.');
  }

  const nearby = await geo.findNearby({ lat, lng, radiusKm: summary.radiusKm });
  res.json({
    ...summary,
    source: summary.provider,
    syncedAt: new Date().toISOString(),
    count: nearby.length,
    places: nearby.map((p) => ({ ...placeLeanToClient(p), distanceMeters: p.distanceMeters })),
  });
});

module.exports = { getPlace, getNearby, getByArea, downloadData, importNearbyPlaces };
