const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const ai = require('../services/ai');
const geo = require('../services/geo');
const Place = require('../models/Place');
const SearchHistory = require('../models/SearchHistory');

/// Tính điểm phù hợp 0-100 cho một địa điểm dựa trên tiêu chí AI đã trích xuất —
/// chỉ dùng để XẾP HẠNG kết quả THẬT lấy từ MongoDB, AI không "bịa" ra địa điểm.
function scorePlace(place, criteria) {
  let score = 55;
  if (criteria.foodTypes?.length) {
    const hit = place.foodTypes.some((f) => criteria.foodTypes.includes(f));
    score += hit ? 25 : -15;
  }
  if (criteria.priceMax != null) {
    score += place.priceMin <= criteria.priceMax ? 10 : -20;
  }
  if (criteria.minRating != null) {
    score += place.rating >= criteria.minRating ? 10 : -10;
  }
  if (typeof place.distanceMeters === 'number' && criteria.maxDistanceKm != null) {
    score += place.distanceMeters / 1000 <= criteria.maxDistanceKm ? 5 : -15;
  }
  score += Math.min(10, (place.rating || 0) * 2);
  return Math.max(1, Math.min(99, Math.round(score)));
}

/// POST /api/ai/suggest  { prompt, lat?, lng?, radiusKm? }
///
/// Luồng: prompt tiếng Việt → AI provider (đổi được qua AI_PROVIDER, xem services/ai/index.js)
/// phân tích thành tiêu chí có cấu trúc → dùng tiêu chí đó truy vấn MongoDB THẬT (geo + lọc)
/// → chấm điểm phù hợp & trả về danh sách địa điểm thật kèm matchScore.
const suggest = asyncHandler(async (req, res) => {
  const { prompt, lat, lng, radiusKm } = req.body;
  if (!prompt || !prompt.trim()) throw ApiError.badRequest('Thiếu prompt.');

  const criteria = await ai.parsePrompt(prompt.trim());

  const filter = geo.buildPlaceFilter({
    priceMax: criteria.priceMax ?? undefined,
    foodTypes: criteria.foodTypes?.length ? criteria.foodTypes : undefined,
    minRating: criteria.minRating ?? undefined,
  });

  let candidates;
  if (lat != null && lng != null) {
    candidates = await geo.findNearby({
      lat,
      lng,
      radiusKm: criteria.maxDistanceKm || radiusKm || 5,
      filter,
    });
  } else {
    candidates = await Place.find({ isActive: true, ...filter }).limit(30).lean();
  }

  const ranked = candidates
    .map((p) => ({ place: p, matchScore: scorePlace(p, criteria) }))
    .sort((a, b) => b.matchScore - a.matchScore)
    .slice(0, 10)
    .map(({ place, matchScore }) => ({
      id: place._id.toString(),
      name: place.name,
      description: place.description,
      foodTypes: place.foodTypes,
      priceMin: place.priceMin,
      priceMax: place.priceMax,
      rating: place.rating,
      reviewCount: place.reviewCount,
      address: place.address,
      latitude: place.location.coordinates[1],
      longitude: place.location.coordinates[0],
      imageUrls: place.imageUrls,
      needsReview: !!place.needsReview,
      distanceMeters: place.distanceMeters,
      matchScore,
    }));

  if (req.user) {
    await SearchHistory.create({ user: req.user._id, keyword: prompt.trim() });
  }

  res.json({ criteria, places: ranked });
});

module.exports = { suggest };
