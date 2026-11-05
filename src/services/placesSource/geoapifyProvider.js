const env = require('../../config/env');
const { buildParams } = require('./geoapifyMapper');

/// Lấy quán ăn/uống từ Geoapify Places API — cần GEOAPIFY_API_KEY (đăng ký bằng email tại
/// https://myprojects.geoapify.com, không cần thẻ tín dụng; gói miễn phí 3.000 credit/ngày).
async function fetchNearby({ lat, lng, radiusKm, limit = 200 }) {
  if (!env.geoapifyApiKey) throw new Error('Thiếu GEOAPIFY_API_KEY trong .env');
  const url = new URL('https://api.geoapify.com/v2/places');
  const params = buildParams({ lat, lng, radiusMeters: radiusKm * 1000, limit, apiKey: env.geoapifyApiKey });
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);

  // Không ghi URL vào thông báo lỗi để không làm lộ API key trong log.
  const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
  if (res.status === 401 || res.status === 403) throw new Error('GEOAPIFY_API_KEY không hợp lệ hoặc đã hết quyền');
  if (res.status === 429) throw new Error('Geoapify báo hết hạn mức (429) — đợi sang ngày mới hoặc nâng gói');
  if (!res.ok) throw new Error(`Geoapify trả về HTTP ${res.status}`);
  const data = await res.json();
  return data.features || [];
}

module.exports = { fetchNearby };
