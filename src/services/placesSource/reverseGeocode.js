const env = require('../../config/env');
const { normalizeProvinceName } = require('./overpassMapper');

// Cache theo ô ~1km để không gọi Nominatim lặp lại (chính sách: tối đa 1 yêu cầu/giây).
const cache = new Map();

/// Từ toạ độ → tên tỉnh/thành (qua Nominatim của OpenStreetMap). Trả null nếu không xác định được.
async function lookupProvince(lat, lng) {
  const key = `${lat.toFixed(2)},${lng.toFixed(2)}`;
  if (cache.has(key)) return cache.get(key);

  const url = new URL('/reverse', env.nominatimUrl);
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('lat', String(lat));
  url.searchParams.set('lon', String(lng));
  url.searchParams.set('zoom', '10');
  url.searchParams.set('accept-language', 'vi');

  const res = await fetch(url, { headers: { 'User-Agent': env.osmUserAgent }, signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error(`Nominatim trả về HTTP ${res.status}`);
  const data = await res.json();
  const a = data.address || {};
  const province = normalizeProvinceName(a.state || a.province || a.city || a.county || null);
  if (province) cache.set(key, province);
  return province;
}

module.exports = { lookupProvince };
