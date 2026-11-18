const env = require('../config/env');

const PLACEHOLDER = 'Chưa có địa chỉ trên OpenStreetMap';

/// Quán cần tra địa chỉ cụ thể khi: chưa từng tra, và địa chỉ đang trống / là chữ thay thế / quá sơ sài (< 3 thành phần).
function needsAddressLookup(place) {
  if (place.addressResolved) return false;
  const addr = String(place.address || '').trim();
  if (!addr || addr === PLACEHOLDER) return true;
  return addr.split(',').filter((s) => s.trim()).length < 3;
}

const stripCountry = (s) => String(s || '').replace(/,?\s*(Việt Nam|Vietnam)\s*$/i, '').trim();
const dedupe = (parts) => parts.filter((p, i) => p && (i === 0 || p !== parts[i - 1]));

/// Kết quả "reverse geocode" của Geoapify (format=json) → địa chỉ dạng "số nhà đường, phường, quận, thành phố".
function composeFromGeoapify(r) {
  const street = [r.housenumber, r.street].filter(Boolean).join(' ');
  const parts = dedupe([street, r.suburb || r.quarter, r.district, r.city || r.county, r.state]);
  if (parts.length >= 2) return parts.join(', ');
  return stripCountry(r.address_line2 || r.formatted || '') || null;
}

/// Kết quả của Nominatim → cùng định dạng.
function composeFromNominatim(a) {
  const street = [a.house_number, a.road].filter(Boolean).join(' ');
  const ward = a.suburb || a.quarter || a.neighbourhood || a.village || a.hamlet;
  const district = a.city_district || a.district || a.county || a.municipality || a.town;
  const parts = dedupe([street, ward, district, a.city, a.state]);
  return parts.length >= 2 ? parts.join(', ') : null;
}

/// Tra địa chỉ từ toạ độ: ưu tiên Geoapify (nếu có key), không thì Nominatim (OpenStreetMap, không cần key).
/// Lưu ý: kết quả là địa chỉ GẦN NHẤT theo toạ độ (nhà/đường gần quán nhất), có thể thiếu số nhà ở khu vực OSM chưa đủ chi tiết.
async function lookup(lat, lng) {
  if (env.geoapifyApiKey) {
    const url = new URL('https://api.geoapify.com/v1/geocode/reverse');
    url.searchParams.set('lat', String(lat));
    url.searchParams.set('lon', String(lng));
    url.searchParams.set('lang', 'vi');
    url.searchParams.set('format', 'json');
    url.searchParams.set('apiKey', env.geoapifyApiKey);
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (res.ok) {
      const data = await res.json();
      const found = data.results && data.results[0] ? composeFromGeoapify(data.results[0]) : null;
      if (found) return found;
    }
    // Geoapify lỗi/không có kết quả → thử Nominatim bên dưới.
  }
  const url = new URL('/reverse', env.nominatimUrl);
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('lat', String(lat));
  url.searchParams.set('lon', String(lng));
  url.searchParams.set('zoom', '18');
  url.searchParams.set('addressdetails', '1');
  url.searchParams.set('accept-language', 'vi');
  const res = await fetch(url, { headers: { 'User-Agent': env.osmUserAgent }, signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error(`Nominatim trả về HTTP ${res.status}`);
  const data = await res.json();
  return data.address ? composeFromNominatim(data.address) : null;
}

module.exports = { lookup, needsAddressLookup, composeFromGeoapify, composeFromNominatim, PLACEHOLDER };
