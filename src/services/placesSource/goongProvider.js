const env = require('../../config/env');

/// Nguồn dữ liệu địa điểm THẬT — dùng Goong Places API (công ty bản đồ Việt Nam,
/// dữ liệu địa chỉ/toạ độ theo chuẩn tương thích Google Places, có gói miễn phí
/// 30.000 lượt gọi/tháng, lấy key tại https://account.goong.io).
///
/// Chỉ dùng 2 endpoint:
///  • /Place/AutoComplete — tìm địa điểm theo từ khoá + vị trí trung tâm + bán kính
///  • /Place/Detail       — lấy toạ độ & địa chỉ đầy đủ của một địa điểm theo place_id
///
/// Lưu ý: Goong KHÔNG trả về đánh giá/giá/giờ mở cửa/ảnh (đó không phải dữ liệu họ
/// cung cấp) — các trường đó được gán giá trị khởi tạo hợp lý trong importPlaces.js,
/// cần người quản trị cập nhật thủ công sau khi nhập.
const BASE_URL = 'https://rsapi.goong.io';

function ensureConfigured() {
  if (!env.goongApiKey) {
    throw new Error('Thiếu GOONG_API_KEY trong .env — lấy miễn phí tại https://account.goong.io rồi điền vào.');
  }
}

/// Tìm các địa điểm khớp [keyword] trong bán kính [radiusKm] quanh [lat,lng].
/// Trả về mảng { placeId, name, description }.
async function searchNearby({ lat, lng, radiusKm, keyword, limit = 15 }) {
  ensureConfigured();
  const url = new URL('/Place/AutoComplete', BASE_URL);
  url.searchParams.set('api_key', env.goongApiKey);
  url.searchParams.set('input', keyword);
  url.searchParams.set('location', `${lat},${lng}`);
  url.searchParams.set('radius', String(radiusKm));
  url.searchParams.set('limit', String(limit));

  const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error(`Goong AutoComplete lỗi ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  const predictions = data.predictions || [];
  return predictions.map((p) => ({
    placeId: p.place_id,
    name: p.structured_formatting?.main_text || p.description,
    description: p.description,
  }));
}

/// Lấy toạ độ + địa chỉ đầy đủ của một địa điểm theo place_id.
/// Trả về null nếu Goong không có dữ liệu chi tiết cho place_id này.
async function getDetail(placeId) {
  ensureConfigured();
  const url = new URL('/Place/Detail', BASE_URL);
  url.searchParams.set('api_key', env.goongApiKey);
  url.searchParams.set('place_id', placeId);

  const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error(`Goong Place Detail lỗi ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  const result = data.result;
  if (!result || !result.geometry) return null;
  return {
    name: result.name,
    formattedAddress: result.formatted_address,
    lat: result.geometry.location.lat,
    lng: result.geometry.location.lng,
  };
}

module.exports = { searchNearby, getDetail };
