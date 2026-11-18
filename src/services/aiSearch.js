/// Logic THUẦN của tìm kiếm AI (không gọi mạng/DB) — tách riêng để kiểm thử được.
///
/// Nguyên tắc: tiêu chí do AI/bộ phân tích rút ra chỉ LOẠI CỨNG khi dữ liệu đủ tin cậy (loại món người dùng nói rõ).
/// Đánh giá và giá là tín hiệu XẾP HẠNG, vì quán nhập từ OpenStreetMap/Geoapify chưa có đánh giá (rating = 0) và
/// giá chỉ là ước lượng (needsReview) — loại cứng theo chúng sẽ làm gần như mọi truy vấn trả về rỗng.
const MAX_RADIUS_KM = 5;

function buildCandidateFilter(criteria) {
  const filter = {};
  if (criteria.foodTypes && criteria.foodTypes.length > 0) filter.foodTypes = { $in: criteria.foodTypes };
  if (criteria.priceMax != null) {
    // Giá ước lượng (needsReview) không đủ tin cậy để loại — chỉ loại các quán có giá thật vượt ngân sách.
    filter.$or = [{ needsReview: true }, { priceMin: { $lte: criteria.priceMax } }];
  }
  return filter;
}

/// Điểm phù hợp 1–99 dùng để XẾP HẠNG quán thật lấy từ MongoDB (AI không "bịa" ra địa điểm).
function scorePlace(place, criteria) {
  let score = 55;
  if (criteria.foodTypes && criteria.foodTypes.length > 0) {
    score += place.foodTypes.some((f) => criteria.foodTypes.includes(f)) ? 25 : -15;
  }
  if (criteria.priceMax != null) {
    const ok = place.priceMin <= criteria.priceMax;
    score += place.needsReview ? (ok ? 3 : -3) : ok ? 10 : -20;
  }
  // Quán chưa có đánh giá: trung tính (không thưởng, không phạt). Quán ĐÃ BIẾT là dưới mức người dùng muốn thì
  // bị phạt nặng hơn mức thưởng khi đạt — khi người dùng đòi chất lượng, "dưới chuẩn" tệ hơn "chưa rõ".
  if (criteria.minRating != null && place.rating > 0) {
    score += place.rating >= criteria.minRating ? 10 : -15;
  }
  if (typeof place.distanceMeters === 'number' && criteria.maxDistanceKm != null) {
    score += place.distanceMeters / 1000 <= criteria.maxDistanceKm ? 5 : -15;
  }
  score += Math.min(10, (place.rating || 0) * 2);
  return Math.max(1, Math.min(99, Math.round(score)));
}

/// Dãy bán kính thử lần lượt: nếu quanh bạn có quá ít quán trong bán kính ban đầu thì mở rộng dần (tối đa 5 km).
function widenedRadii(initialKm) {
  const base = Math.min(Math.max(Number(initialKm) || 5, 0.5), MAX_RADIUS_KM);
  return [...new Set([base, Math.min(base * 3, MAX_RADIUS_KM), MAX_RADIUS_KM])];
}

module.exports = { buildCandidateFilter, scorePlace, widenedRadii, MAX_RADIUS_KM };
