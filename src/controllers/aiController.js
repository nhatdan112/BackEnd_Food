const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const ai = require('../services/ai');
const geo = require('../services/geo');
const { buildCandidateFilter, scorePlace, widenedRadii } = require('../services/aiSearch');
const Place = require('../models/Place');
const SearchHistory = require('../models/SearchHistory');

const MIN_GOOD_RESULTS = 3;

/// POST /api/ai/suggest  { prompt, lat?, lng?, radiusKm? }
///
/// Luồng: prompt tiếng Việt → AI provider (đổi được qua AI_PROVIDER, xem services/ai/index.js) phân tích thành
/// tiêu chí có cấu trúc → truy vấn MongoDB THẬT (loại cứng chỉ theo loại món/giá thật; xem services/aiSearch.js)
/// → chấm điểm & xếp hạng quán thật. Có vị trí mà quanh bạn quá ít quán thì tự mở rộng bán kính (tối đa 5 km).
const suggest = asyncHandler(async (req, res) => {
  const { prompt, lat, lng, radiusKm } = req.body;
  if (!prompt || !prompt.trim()) throw ApiError.badRequest('Thiếu prompt.');

  const criteria = await ai.parsePrompt(prompt.trim());
  const filter = buildCandidateFilter(criteria);
  const notes = [];

  let candidates;
  if (lat != null && lng != null) {
    const radii = widenedRadii(criteria.maxDistanceKm || radiusKm || 5);
    let used = radii[0];
    candidates = [];
    for (const r of radii) {
      candidates = await geo.findNearby({ lat, lng, radiusKm: r, filter });
      used = r;
      if (candidates.length >= MIN_GOOD_RESULTS) break;
    }
    if (used > radii[0]) notes.push(`Có ít quán trong ${radii[0]} km nên đã mở rộng bán kính tìm kiếm tới ${used} km.`);
  } else {
    candidates = await Place.find({ isActive: true, ...filter }).limit(100).lean();
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

  res.json({ criteria, places: ranked, notes });
});

module.exports = { suggest };
