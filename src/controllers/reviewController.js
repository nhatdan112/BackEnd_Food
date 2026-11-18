const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { isObjectIdString } = require('../utils/objectId');
const Place = require('../models/Place');
const Review = require('../models/Review');
const PlacePhoto = require('../models/PlacePhoto');
const sentiment = require('../services/sentiment');
const { summarizeReviews, DEFAULT_GLOBAL_MEAN } = require('../services/reviewSummary');

const round1 = (n) => Math.round(n * 10) / 10;

// Điểm trung bình toàn hệ thống (C trong công thức Bayesian) — lưu tạm 60 giây; ít hơn 20 đánh giá thì dùng giá trị mặc định.
let meanCache = { value: DEFAULT_GLOBAL_MEAN, at: 0 };
async function globalMeanRating() {
  if (Date.now() - meanCache.at < 60000) return meanCache.value;
  const rows = await Review.aggregate([{ $group: { _id: null, avg: { $avg: '$rating' }, n: { $sum: 1 } } }]);
  const value = rows[0] && rows[0].n >= 20 ? rows[0].avg : DEFAULT_GLOBAL_MEAN;
  meanCache = { value, at: Date.now() };
  return value;
}

/// Tính lại điểm trung bình & số đánh giá của quán từ các đánh giá thật và ghi vào Place.
async function refreshPlaceAggregate(placeId) {
  const rows = await Review.find({ place: placeId }).select('rating').limit(5000).lean();
  const count = rows.length;
  const rating = count ? round1(rows.reduce((a, r) => a + r.rating, 0) / count) : 0;
  await Place.updateOne({ _id: placeId }, { $set: { rating, reviewCount: count } });
  return { rating, reviewCount: count };
}

function toClientReview(doc, viewerId) {
  const u = doc.user && doc.user._id ? doc.user : null;
  return {
    id: doc._id.toString(),
    user: u ? { id: u._id.toString(), fullName: u.fullName, avatarUrl: u.avatarUrl || null } : { id: '', fullName: 'Người dùng đã xoá', avatarUrl: null },
    rating: doc.rating,
    comment: doc.comment || '',
    photos: doc.photos || [],
    createdAt: doc.createdAt,
    sentiment: doc.sentiment ? doc.sentiment.label : null,
    mine: !!(viewerId && u && u._id.toString() === viewerId.toString()),
  };
}

const isPlacePhoto = (url, placeId) =>
  typeof url === 'string' && url.startsWith(`/uploads/places/${placeId}/`) && !url.includes('..');

/// GET /api/places/:id/reviews?limit=20&before=<ISO>  — danh sách đánh giá (mới nhất trước) + bản tóm tắt.
const listReviews = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!isObjectIdString(id)) throw ApiError.notFound('Không tìm thấy địa điểm.');
  if (!(await Place.findById(id).select('_id').lean())) throw ApiError.notFound('Không tìm thấy địa điểm.');

  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 50);
  const filter = { place: id };
  const before = req.query.before ? new Date(req.query.before) : null;
  if (before && !Number.isNaN(before.getTime())) filter.createdAt = { $lt: before };

  const docs = await Review.find(filter).sort({ createdAt: -1 }).limit(limit).populate('user', 'fullName avatarUrl').lean();
  // Ảnh đính kèm đánh giá: người khác chỉ thấy ảnh ĐÃ DUYỆT; tác giả thấy tất cả ảnh của mình (kể cả đang chờ duyệt).
  const allUrls = [...new Set(docs.flatMap((d) => d.photos || []))];
  const approved = new Set();
  if (allUrls.length > 0) {
    const rows = await PlacePhoto.find({ place: id, url: { $in: allUrls }, status: 'approved' }).select('url').lean();
    for (const r of rows) approved.add(r.url);
  }
  const forSummary = await Review.find({ place: id }).select('rating sentiment aspects keywords').limit(2000).lean();
  const summary = summarizeReviews(forSummary, { globalMean: await globalMeanRating() });
  const viewerId = req.user && req.user._id;
  res.json({
    reviews: docs.map((d) => {
      const client = toClientReview(d, viewerId);
      client.photos = (d.photos || []).filter((u) => client.mine || approved.has(u));
      return client;
    }),
    summary,
  });
});

/// POST /api/places/:id/reviews  { rating: 1-5, comment?, photos?: ["/uploads/places/<id>/..."] }
/// Mỗi người một đánh giá/quán: gửi lại sẽ cập nhật. Bình luận được phân tích cảm xúc ngay khi lưu.
const submitReview = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!isObjectIdString(id)) throw ApiError.notFound('Không tìm thấy địa điểm.');
  const rating = Number(req.body.rating);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) throw ApiError.badRequest('Số sao phải là số nguyên từ 1 đến 5.');
  const comment = String(req.body.comment || '').trim().slice(0, 1000);
  const candidates = (Array.isArray(req.body.photos) ? req.body.photos : []).filter((u) => isPlacePhoto(u, id)).slice(0, 3);
  // Chỉ nhận ảnh do CHÍNH người này đã tải lên cho quán này và chưa bị từ chối/ẩn.
  let photos = [];
  if (candidates.length > 0) {
    const rows = await PlacePhoto.find({ place: id, user: req.user._id, url: { $in: candidates }, status: { $in: ['approved', 'pending'] } }).select('url').lean();
    const ok = new Set(rows.map((r) => r.url));
    photos = candidates.filter((u) => ok.has(u));
  }
  if (!(await Place.findById(id).select('_id').lean())) throw ApiError.notFound('Không tìm thấy địa điểm.');

  const a = sentiment.analyze(comment, rating);
  const saved = await Review.findOneAndUpdate(
    { place: id, user: req.user._id },
    {
      $set: {
        rating,
        comment,
        photos,
        sentiment: { label: a.label, score: a.score, source: a.source },
        aspects: a.aspects,
        keywords: a.keywords,
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
  const place = await refreshPlaceAggregate(id);
  res.status(201).json({
    review: toClientReview({ ...(saved.toObject ? saved.toObject() : saved), user: req.user }, req.user._id),
    place,
  });
});

/// DELETE /api/places/:id/reviews/me — xoá đánh giá của chính mình.
const deleteMyReview = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!isObjectIdString(id)) throw ApiError.notFound('Không tìm thấy địa điểm.');
  await Review.deleteOne({ place: id, user: req.user._id });
  res.json({ place: await refreshPlaceAggregate(id) });
});

module.exports = { listReviews, submitReview, deleteMyReview, refreshPlaceAggregate, toClientReview };
