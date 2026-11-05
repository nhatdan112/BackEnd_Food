const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const Place = require('../models/Place');
const SearchHistory = require('../models/SearchHistory');
const Interaction = require('../models/Interaction');
const { isObjectIdString } = require('../utils/objectId');

/// PATCH /api/users/me — cập nhật hồ sơ cơ bản (không đổi email/mật khẩu ở đây).
const updateProfile = asyncHandler(async (req, res) => {
  const { fullName, location, avatarUrl } = req.body;
  const user = req.user;
  if (typeof fullName === 'string' && fullName.trim()) user.fullName = fullName.trim();
  if (typeof location === 'string') user.location = location.trim();
  if (typeof avatarUrl === 'string') user.avatarUrl = avatarUrl.trim() || null;
  await user.save();
  res.json({ user: user.toPublicJSON() });
});

/// PATCH /api/users/me/preferences
const updatePreferences = asyncHandler(async (req, res) => {
  const { foodTypes, priceMin, priceMax, maxDistanceKm, minRating } = req.body;
  const user = req.user;
  user.preferences = {
    foodTypes: Array.isArray(foodTypes) ? foodTypes : user.preferences.foodTypes,
    priceMin: priceMin ?? user.preferences.priceMin,
    priceMax: priceMax ?? user.preferences.priceMax,
    maxDistanceKm: maxDistanceKm ?? user.preferences.maxDistanceKm,
    minRating: minRating ?? user.preferences.minRating,
  };
  await user.save();
  res.json({ preferences: user.preferences });
});

/// POST /api/users/me/favorites/:placeId — bật/tắt yêu thích (toggle)
const toggleFavorite = asyncHandler(async (req, res) => {
  const { placeId } = req.params;
  if (!isObjectIdString(placeId)) throw ApiError.badRequest('placeId không hợp lệ (không phải địa điểm trong cơ sở dữ liệu).');
  const place = await Place.findById(placeId);
  if (!place) throw ApiError.notFound('Không tìm thấy địa điểm.');

  const user = req.user;
  const idx = user.favorites.findIndex((id) => id.toString() === placeId);
  let isFavorite;
  if (idx >= 0) {
    user.favorites.splice(idx, 1);
    isFavorite = false;
  } else {
    user.favorites.push(place._id);
    isFavorite = true;
    await Interaction.create({ user: user._id, place: place._id, type: 'favorite' });
  }
  await user.save();
  res.json({ isFavorite, favorites: user.favorites });
});

/// GET /api/users/me/history/search
const getSearchHistory = asyncHandler(async (req, res) => {
  const items = await SearchHistory.find({ user: req.user._id }).sort({ createdAt: -1 }).limit(50);
  res.json({ items });
});

/// POST /api/users/me/history/search  { keyword }
const addSearchHistory = asyncHandler(async (req, res) => {
  const { keyword } = req.body;
  if (!keyword || !keyword.trim()) throw ApiError.badRequest('Thiếu keyword.');
  const item = await SearchHistory.create({ user: req.user._id, keyword: keyword.trim() });
  res.status(201).json({ item });
});

const clearSearchHistory = asyncHandler(async (req, res) => {
  await SearchHistory.deleteMany({ user: req.user._id });
  res.json({ message: 'Đã xoá lịch sử tìm kiếm.' });
});

const removeSearchHistoryItem = asyncHandler(async (req, res) => {
  if (!isObjectIdString(req.params.id)) throw ApiError.badRequest('id không hợp lệ.');
  await SearchHistory.deleteOne({ _id: req.params.id, user: req.user._id });
  res.json({ message: 'Đã xoá.' });
});

/// GET /api/users/me/history/interactions
const getInteractionHistory = asyncHandler(async (req, res) => {
  const items = await Interaction.find({ user: req.user._id })
    .sort({ createdAt: -1 })
    .limit(100)
    .populate('place');
  // Chuẩn hoá `place` lồng bên trong về đúng hình dạng toClientJSON() (id/latitude/
  // longitude...) để client dùng chung được Place.fromJson() như mọi endpoint khác.
  res.json({
    items: items
      .filter((it) => it.place) // bỏ qua nếu địa điểm đã bị xoá khỏi hệ thống
      .map((it) => ({
        id: it._id.toString(),
        type: it.type,
        createdAt: it.createdAt,
        place: it.place.toClientJSON(),
      })),
  });
});

/// POST /api/users/me/history/interactions  { placeId, type }
const addInteraction = asyncHandler(async (req, res) => {
  const { placeId, type } = req.body;
  if (!['view', 'favorite', 'search', 'select'].includes(type)) {
    throw ApiError.badRequest('type không hợp lệ.');
  }
  if (!isObjectIdString(placeId)) throw ApiError.badRequest('placeId không hợp lệ (không phải địa điểm trong cơ sở dữ liệu).');
  const place = await Place.findById(placeId);
  if (!place) throw ApiError.notFound('Không tìm thấy địa điểm.');
  const item = await Interaction.create({ user: req.user._id, place: place._id, type });
  res.status(201).json({ item });
});

module.exports = {
  updateProfile,
  updatePreferences,
  toggleFavorite,
  getSearchHistory,
  addSearchHistory,
  clearSearchHistory,
  removeSearchHistoryItem,
  getInteractionHistory,
  addInteraction,
};
