const env = require('../config/env');
const Place = require('../models/Place');
const overpass = require('./placesSource/overpassProvider');
const geoapify = require('./placesSource/geoapifyProvider');
const { normalizeFeature } = require('./placesSource/geoapifyMapper');
const reverseGeocode = require('./placesSource/reverseGeocode');
const { normalizeElement, normalizeProvinceName } = require('./placesSource/overpassMapper');

const MAX_RADIUS_KM = 5; // giữ truy vấn nhẹ để không làm quá tải máy chủ Overpass công cộng
const MIN_RADIUS_KM = 0.3;

/// Lấy & chuẩn hoá quán quanh toạ độ: ưu tiên Geoapify (nếu có key), lỗi thì tự rơi về OpenStreetMap.
async function fetchPlaces({ lat, lng, radiusKm }) {
  const wantGeoapify = env.placesProvider === 'geoapify' || (env.placesProvider === 'auto' && env.geoapifyApiKey);
  if (wantGeoapify) {
    try {
      const features = await geoapify.fetchNearby({ lat, lng, radiusKm });
      return { provider: 'geoapify', fetched: features.length, places: features.map(normalizeFeature).filter(Boolean) };
    } catch (err) {
      console.warn(`[places] Geoapify lỗi (${err.message}) — chuyển sang OpenStreetMap`);
      if (env.placesProvider === 'geoapify') throw err; // người dùng ép dùng Geoapify → không âm thầm đổi nguồn
    }
  }
  const elements = await overpass.fetchNearby({ lat, lng, radiusKm });
  return { provider: 'overpass', fetched: elements.length, places: elements.map(normalizeElement).filter(Boolean) };
}

/// Nhập quán ăn thật quanh một toạ độ từ OpenStreetMap vào MongoDB (upsert theo externalId nên
/// chạy lại nhiều lần không bị trùng). Dùng chung cho endpoint HTTP và script dòng lệnh.
///
/// KHÔNG ghi đè dữ liệu người quản trị đã chỉnh tay (giá/mô tả/ảnh/đánh giá chỉ đặt khi tạo mới;
/// giờ mở cửa/địa chỉ chỉ cập nhật khi OSM thật sự có thông tin).
async function importNearby({ lat, lng, radiusKm = 2, province }) {
  const radius = Math.min(Math.max(radiusKm, MIN_RADIUS_KM), MAX_RADIUS_KM);
  const { provider, fetched, places } = await fetchPlaces({ lat, lng, radiusKm: radius });

  // Tỉnh/thành: ưu tiên giá trị truyền vào → thẻ addr của OSM → tra ngược từ toạ độ.
  let fallbackProvince = province ? normalizeProvinceName(province) : null;
  if (!fallbackProvince && places.some((p) => !p.province)) {
    fallbackProvince = await reverseGeocode.lookupProvince(lat, lng).catch(() => null);
  }
  fallbackProvince = fallbackProvince || 'Chưa xác định';

  if (places.length === 0) {
    return { provider, radiusKm: radius, fetched, usable: 0, created: 0, updated: 0, province: fallbackProvince };
  }

  const ops = places.map((p) => {
    const set = {
      name: p.name,
      foodTypes: p.foodTypes,
      location: { type: 'Point', coordinates: [p.lng, p.lat] },
      province: normalizeProvinceName(p.province) || fallbackProvince,
      source: p.source || 'osm',
      sourceUpdatedAt: new Date(),
      isActive: true,
    };
    const setOnInsert = {
      description: 'Dữ liệu từ OpenStreetMap — cần rà soát mô tả, giá, đánh giá và ảnh.',
      priceMin: p.priceMin,
      priceMax: p.priceMax,
      rating: 0,
      reviewCount: 0,
      imageUrls: [],
      needsReview: true,
    };
    if (p.address) set.address = p.address;
    else setOnInsert.address = 'Chưa có địa chỉ trên OpenStreetMap';
    if (p.city) set.city = p.city;
    else setOnInsert.city = '';
    if (p.openingHours) set.openingHours = p.openingHours;
    else setOnInsert.openingHours = null;

    return {
      updateOne: {
        filter: { externalId: p.externalId },
        update: { $set: set, $setOnInsert: setOnInsert },
        upsert: true,
      },
    };
  });

  const result = await Place.bulkWrite(ops, { ordered: false });
  return {
    provider,
    radiusKm: radius,
    fetched,
    usable: places.length,
    created: result.upsertedCount || 0,
    updated: result.modifiedCount || 0,
    province: fallbackProvince,
  };
}

module.exports = { importNearby, MAX_RADIUS_KM };
