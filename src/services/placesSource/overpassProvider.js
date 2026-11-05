const env = require('../../config/env');
const { buildQuery } = require('./overpassMapper');

/// Lấy quán ăn/uống THẬT từ OpenStreetMap qua Overpass API (miễn phí, không cần key).
/// Thử máy chủ chính, lỗi/quá tải (429, 5xx, timeout) thì chuyển sang máy chủ dự phòng.
///
/// Lưu ý đặc thù của Overpass: truy vấn quá thời gian/hết bộ nhớ vẫn trả HTTP 200 kèm mảng
/// rỗng và trường "remark" — phải tự kiểm tra, nếu không sẽ tưởng nhầm là "khu vực không có quán".
async function fetchNearby({ lat, lng, radiusKm, limit = 250 }) {
  const query = buildQuery({ lat, lng, radiusMeters: radiusKm * 1000, limit });
  const urls = [env.overpassUrl, env.overpassFallbackUrl].filter(Boolean);
  let lastError;

  for (const url of urls) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': env.osmUserAgent },
        body: new URLSearchParams({ data: query }),
        signal: AbortSignal.timeout(35000),
      });
      if (!res.ok) throw new Error(`Overpass trả về HTTP ${res.status}`);
      const data = await res.json();
      if (data.remark && /runtime error|timed out|out of memory/i.test(data.remark)) {
        throw new Error(`Overpass báo lỗi truy vấn: ${data.remark}`);
      }
      return data.elements || [];
    } catch (err) {
      lastError = err;
      console.warn(`[overpass] ${url} thất bại: ${err.message}`);
    }
  }
  throw lastError;
}

module.exports = { fetchNearby };
