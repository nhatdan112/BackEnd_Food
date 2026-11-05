/// Logic THUẦN chuyển dữ liệu Geoapify Places API (GeoJSON) sang hình dạng Place của FoodFinder.
/// Geoapify dựng trên dữ liệu OpenStreetMap + chuẩn hoá địa chỉ, nên thường đầy đủ & sạch hơn
/// Overpass thô (có thành phố/quận, loại hình, giờ mở cửa, liên hệ).
const { inferFoodTypes, inferPriceRange } = require('./overpassMapper');

const CATEGORIES = ['catering.restaurant', 'catering.cafe', 'catering.fast_food', 'catering.food_court'];

/// Tham số cho GET https://api.geoapify.com/v2/places (lọc theo hình tròn quanh vị trí, ưu tiên gần nhất).
function buildParams({ lat, lng, radiusMeters, limit = 200, apiKey, lang = 'vi' }) {
  return {
    categories: CATEGORIES.join(','),
    filter: `circle:${lng},${lat},${Math.round(radiusMeters)}`, // Geoapify dùng thứ tự lon,lat
    bias: `proximity:${lng},${lat}`,
    limit: String(limit),
    lang,
    apiKey,
  };
}

function osmTypeWord(t) {
  return { n: 'node', w: 'way', r: 'relation', node: 'node', way: 'way', relation: 'relation' }[String(t).toLowerCase()] || null;
}

function dedupeConsecutive(parts) {
  return parts.filter((p, i) => p && (i === 0 || p !== parts[i - 1]));
}

function normalizeFeature(feature) {
  const p = feature.properties || {};
  const raw = (p.datasource && p.datasource.raw) || {};
  const coords = feature.geometry && feature.geometry.coordinates;
  const name = String(p.name || raw.name || '').trim();
  const lat = Number.isFinite(p.lat) ? p.lat : coords && coords[1];
  const lng = Number.isFinite(p.lon) ? p.lon : coords && coords[0];
  if (!name || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  const cats = Array.isArray(p.categories) ? p.categories : [];
  let amenity = 'restaurant';
  if (cats.includes('catering.cafe')) amenity = 'cafe';
  else if (cats.includes('catering.fast_food')) amenity = 'fast_food';
  else if (cats.includes('catering.food_court')) amenity = 'food_court';

  // Gom gợi ý món ăn từ: thẻ cuisine, và đoạn cuối của category con (vd catering.restaurant.pizza → pizza).
  const subCats = cats.filter((c) => c.split('.').length >= 3).map((c) => c.split('.').pop());
  const cuisine = [p.catering && p.catering.cuisine, raw.cuisine, ...subCats].filter(Boolean).join(';');
  const tags = { amenity, cuisine };

  const foodTypes = inferFoodTypes(tags, name);
  const [priceMin, priceMax] = inferPriceRange(tags, foodTypes);

  const street = [p.housenumber, p.street].filter(Boolean).join(' ');
  const address =
    dedupeConsecutive([street, p.suburb || p.quarter, p.district, p.city]).join(', ') || p.address_line2 || '';

  // Cùng quán nhưng đã được nhập từ Overpass → dùng chung id "osm:..." để không bị trùng bản ghi.
  const osmType = osmTypeWord(raw.osm_type);
  const externalId = osmType && raw.osm_id ? `osm:${osmType}/${raw.osm_id}` : `geoapify:${p.place_id}`;

  return {
    externalId,
    source: 'geoapify',
    name,
    lat,
    lng,
    foodTypes,
    priceMin,
    priceMax,
    address,
    city: p.district || p.county || '',
    province: p.state || p.city || '',
    openingHours: p.opening_hours || raw.opening_hours || null,
  };
}

module.exports = { buildParams, normalizeFeature, CATEGORIES };
