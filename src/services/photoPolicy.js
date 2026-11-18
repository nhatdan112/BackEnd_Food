/// Chính sách kiểm duyệt ảnh quán (logic THUẦN, kiểm thử được). Không có cách tự động đảm bảo 100% ảnh đúng quán,
/// nên dùng nhiều lớp (xem docs/BAO_CAO_DO_AN.md, mục kiểm duyệt nội dung):
///  1. AI (tuỳ chọn): ảnh không an toàn / không phải ảnh món ăn-quán ăn → TỪ CHỐI ngay.
///  2. Có mặt tại quán: vị trí người tải cách quán ≤ ngưỡng (mặc định 300 m) → DUYỆT ngay.
///  3. Người dùng tin cậy (≥ 3 ảnh đã duyệt, chưa vi phạm) → DUYỆT ngay.
///  4. Còn lại → CHỜ DUYỆT (chỉ người tải thấy cho đến khi quản trị duyệt).
///  5. Sau khi công khai: người dùng báo cáo; đủ ngưỡng báo cáo → tự ẩn.
const TRUSTED_MIN_APPROVED = 3;

function haversineMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/// Người dùng tin cậy: đã có ít nhất 3 ảnh được duyệt và chưa có ảnh nào bị từ chối/ẩn.
function isTrusted(photos) {
  let approved = 0;
  for (const p of photos) {
    if (p.status === 'approved') approved += 1;
    else if (p.status === 'rejected' || p.status === 'hidden') return false;
  }
  return approved >= TRUSTED_MIN_APPROVED;
}

/// aiVerdict: 'ok' | 'unsafe' | 'irrelevant' | 'unknown'. aiConfigured: có bật kiểm duyệt AI hay không.
/// Khi AI đã bật mà không cho được kết quả (lỗi/hết hạn mức) thì KHÔNG tự duyệt — chuyển sang chờ duyệt (an toàn trước).
function decidePhotoStatus({ aiVerdict, aiConfigured, distanceMeters, trusted, presenceMeters = 300 }) {
  if (aiVerdict === 'unsafe') return { status: 'rejected', method: 'ai', reason: 'unsafe' };
  if (aiVerdict === 'irrelevant') return { status: 'rejected', method: 'ai', reason: 'irrelevant' };
  if (aiConfigured && aiVerdict !== 'ok') return { status: 'pending', method: 'ai', reason: 'ai_unavailable' };
  if (trusted) return { status: 'approved', method: 'trusted', reason: 'trusted_user' };
  if (distanceMeters != null && distanceMeters <= presenceMeters) return { status: 'approved', method: 'presence', reason: 'near_place' };
  return { status: 'pending', method: 'presence', reason: distanceMeters == null ? 'no_location' : 'too_far' };
}

const shouldAutoHide = (reportCount, threshold = 3) => reportCount >= threshold;

module.exports = { haversineMeters, isTrusted, decidePhotoStatus, shouldAutoHide, TRUSTED_MIN_APPROVED };
