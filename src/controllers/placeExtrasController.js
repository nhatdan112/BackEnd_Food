const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { isObjectIdString } = require('../utils/objectId');
const env = require('../config/env');
const Place = require('../models/Place');
const PlacePhoto = require('../models/PlacePhoto');
const imageModeration = require('../services/imageModeration');
const { haversineMeters, isTrusted, decidePhotoStatus, shouldAutoHide } = require('../services/photoPolicy');
const reverseAddress = require('../services/reverseAddress');

const MAX_PHOTO_BYTES = 4 * 1024 * 1024;
const MAX_PHOTOS_PER_PLACE = 20;
const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

// Kiểm tra "chữ ký" đầu file để không lưu file giả danh ảnh.
function matchesMagic(buf, mime) {
  if (mime === 'image/jpeg') return buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
  if (mime === 'image/png') return buf.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  if (mime === 'image/webp') return buf.slice(0, 4).toString() === 'RIFF' && buf.slice(8, 12).toString() === 'WEBP';
  return false;
}

const toNumber = (v) => (v === undefined || v === null || v === '' || Number.isNaN(Number(v)) ? null : Number(v));

const STATUS_MESSAGE = {
  approved: 'Đã thêm ảnh. Cảm ơn bạn đã đóng góp!',
  pending: 'Ảnh đã được gửi và đang chờ duyệt — sẽ hiển thị công khai sau khi được duyệt.',
};

/// POST /api/places/:id/photos  { imageBase64, mimeType, lat?, lng? }  — người dùng đóng góp ảnh cho quán.
/// Mỗi ảnh đi qua chính sách kiểm duyệt (services/photoPolicy.js): AI (tuỳ chọn) → có mặt tại quán / người dùng tin cậy → còn lại
/// chờ duyệt. Chỉ ảnh `approved` mới vào Place.imageUrls (công khai). Ảnh lưu tại UPLOADS_DIR/places/<id>/, phục vụ qua /uploads.
const uploadPhoto = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!isObjectIdString(id)) throw ApiError.notFound('Không tìm thấy địa điểm.');
  const { imageBase64, mimeType } = req.body;
  const ext = EXT[mimeType];
  if (!ext) throw ApiError.badRequest('Chỉ hỗ trợ ảnh JPEG, PNG hoặc WebP.');
  if (typeof imageBase64 !== 'string' || !imageBase64) throw ApiError.badRequest('Thiếu dữ liệu ảnh.');
  const buf = Buffer.from(imageBase64, 'base64');
  if (buf.length === 0 || !matchesMagic(buf, mimeType)) throw ApiError.badRequest('Tệp không phải ảnh hợp lệ.');
  if (buf.length > MAX_PHOTO_BYTES) throw new ApiError(413, 'Ảnh quá lớn (tối đa 4 MB).');

  const place = await Place.findById(id);
  if (!place) throw ApiError.notFound('Không tìm thấy địa điểm.');
  if ((place.imageUrls || []).filter(Boolean).length >= MAX_PHOTOS_PER_PLACE) throw new ApiError(409, 'Quán này đã đủ số lượng ảnh.');

  // Khoảng cách người tải → quán (nếu app gửi vị trí). Chỉ dùng để quyết định duyệt, không lưu vị trí người dùng.
  const lat = toNumber(req.body.lat);
  const lng = toNumber(req.body.lng);
  const distanceMeters = lat !== null && lng !== null ? Math.round(haversineMeters(lat, lng, place.location.coordinates[1], place.location.coordinates[0])) : null;

  const ai = await imageModeration.check(buf, mimeType);
  const mine = await PlacePhoto.find({ user: req.user._id }).select('status').limit(200).lean();
  const decision = decidePhotoStatus({
    aiVerdict: ai.verdict,
    aiConfigured: imageModeration.isConfigured(),
    distanceMeters,
    trusted: isTrusted(mine),
    presenceMeters: env.photoPresenceMeters,
  });

  if (decision.status === 'rejected') {
    // Không lưu file; chỉ ghi nhật ký để truy vết và tính vào độ tin cậy của người tải.
    await PlacePhoto.create({
      place: id,
      user: req.user._id,
      url: `rejected:${crypto.randomBytes(8).toString('hex')}`,
      status: 'rejected',
      distanceMeters,
      moderation: { method: decision.method, verdict: ai.verdict, reason: ai.reason },
    });
    throw new ApiError(422, decision.reason === 'unsafe' ? 'Ảnh có nội dung không phù hợp nên không được chấp nhận.' : 'Ảnh không giống ảnh món ăn hoặc không gian của một quán ăn.');
  }

  const dir = path.join(env.uploadsDir, 'places', id);
  fs.mkdirSync(dir, { recursive: true });
  const name = `${crypto.randomBytes(12).toString('hex')}.${ext}`;
  fs.writeFileSync(path.join(dir, name), buf);
  const url = `/uploads/places/${id}/${name}`;

  await PlacePhoto.create({
    place: id,
    user: req.user._id,
    url,
    status: decision.status,
    distanceMeters,
    moderation: { method: decision.method, verdict: ai.verdict, reason: decision.reason },
  });
  if (decision.status === 'approved') {
    place.imageUrls = [...(place.imageUrls || []).filter(Boolean), url];
    await place.save();
  }
  res.status(201).json({ url, status: decision.status, reason: decision.reason, message: STATUS_MESSAGE[decision.status], imageUrls: (place.imageUrls || []).filter(Boolean) });
});

const REPORT_REASONS = ['not_this_place', 'inappropriate', 'spam', 'other'];

/// POST /api/places/:id/photos/report  { url, reason }  — báo cáo ảnh không đúng quán / không phù hợp / spam.
/// Mỗi người báo cáo một lần cho mỗi ảnh; không báo cáo ảnh của chính mình; đủ ngưỡng (PHOTO_REPORT_THRESHOLD) thì tự ẩn.
const reportPhoto = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!isObjectIdString(id)) throw ApiError.notFound('Không tìm thấy địa điểm.');
  const { url } = req.body;
  const reason = REPORT_REASONS.includes(req.body.reason) ? req.body.reason : 'other';
  if (typeof url !== 'string' || !url.startsWith(`/uploads/places/${id}/`) || url.includes('..')) throw ApiError.badRequest('Ảnh không hợp lệ.');

  const photo = await PlacePhoto.findOne({ place: id, url });
  if (!photo) throw ApiError.notFound('Không tìm thấy ảnh này (ảnh có thể đến từ nguồn khác).');
  const me = req.user._id.toString();
  if (photo.user.toString() === me) throw ApiError.badRequest('Bạn không thể báo cáo ảnh của chính mình.');
  if (photo.reports.some((r) => r.user.toString() === me)) return res.json({ reported: true, hidden: photo.status === 'hidden', duplicate: true });

  photo.reports.push({ user: req.user._id, reason });
  let hidden = false;
  if (photo.status === 'approved' && shouldAutoHide(photo.reports.length, env.photoReportThreshold)) {
    photo.status = 'hidden';
    photo.moderation = { method: 'report', verdict: 'hidden', reason: `Đủ ${photo.reports.length} báo cáo` };
    hidden = true;
    const place = await Place.findById(id);
    if (place) {
      place.imageUrls = (place.imageUrls || []).filter((u) => u !== url);
      await place.save();
    }
  }
  await photo.save();
  res.json({ reported: true, hidden });
});

/// GET /api/places/:id/address — địa chỉ cụ thể của quán. Nếu địa chỉ đang trống/sơ sài thì tra từ toạ độ
/// (Geoapify hoặc Nominatim), lưu lại để các lần sau không phải tra nữa.
const getPlaceAddress = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!isObjectIdString(id)) throw ApiError.notFound('Không tìm thấy địa điểm.');
  const place = await Place.findById(id);
  if (!place) throw ApiError.notFound('Không tìm thấy địa điểm.');
  if (!reverseAddress.needsAddressLookup(place)) {
    return res.json({ address: place.address, resolved: !!place.addressResolved, changed: false });
  }
  let found = null;
  try {
    found = await reverseAddress.lookup(place.location.coordinates[1], place.location.coordinates[0]);
  } catch (err) {
    console.warn('[address] tra địa chỉ thất bại:', err.message);
  }
  if (!found) return res.json({ address: place.address, resolved: false, changed: false });
  place.address = found;
  place.addressResolved = true;
  await place.save();
  return res.json({ address: found, resolved: true, changed: true });
});

module.exports = { uploadPhoto, reportPhoto, getPlaceAddress };
