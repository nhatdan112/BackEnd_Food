/// Logic THUẦN (không gọi mạng, không phụ thuộc thư viện) chuyển dữ liệu OpenStreetMap
/// (qua Overpass API) sang hình dạng Place của FoodFinder — tách riêng để dễ kiểm thử.

const FOOD_AMENITY_REGEX = '^(restaurant|cafe|fast_food|food_court|ice_cream)$';

/// Truy vấn Overpass QL: mọi quán ăn/uống CÓ TÊN trong bán kính [radiusMeters] quanh toạ độ.
/// `nwr` = node + way + relation (nhiều quán được vẽ là toà nhà/"way" chứ không phải điểm).
/// `out center` bắt buộc để way/relation có toạ độ trung tâm (nếu không sẽ không có lat/lon).
function buildQuery({ lat, lng, radiusMeters, limit = 250 }) {
  return (
    '[out:json][timeout:25];' +
    `nwr["amenity"~"${FOOD_AMENITY_REGEX}"]["name"](around:${Math.round(radiusMeters)},${lat},${lng});` +
    `out center ${limit};`
  );
}

// Ghép từ khoá, chỉ coi là "một từ" khi hai bên không phải chữ cái (xử lý đúng tiếng Việt có dấu,
// vì \b của JS không hoạt động với ký tự có dấu).
function wordRegex(words) {
  return new RegExp(`(?<![\\p{L}])(?:${words.join('|')})(?![\\p{L}])`, 'iu');
}

// Tên quán ở Việt Nam thường cho biết loại món — dùng làm nguồn chính vì thẻ `cuisine` hay bị thiếu.
const NAME_RULES = [
  [wordRegex(['phở', 'pho']), 'Phở'],
  [wordRegex(['bún', 'bun', 'bún bò', 'bún chả']), 'Bún'],
  [wordRegex(['lẩu', 'lau', 'hotpot', 'hot pot']), 'Lẩu'],
  [wordRegex(['nướng', 'nuong', 'bbq', 'barbecue', 'grill']), 'Nướng'],
  [wordRegex(['cơm', 'com tấm', 'com tam', 'com gà', 'com ga']), 'Cơm'],
  [wordRegex(['sushi', 'sashimi', 'ramen', 'izakaya', 'nhật', 'japan']), 'Món Nhật'],
  [wordRegex(['hàn quốc', 'han quoc', 'korea', 'korean', 'kimchi']), 'Món Hàn'],
  [wordRegex(['chay', 'vegetarian', 'vegan']), 'Chay'],
  [wordRegex(['cà phê', 'ca phe', 'cafe', 'café', 'coffee', 'trà sữa', 'tra sua']), 'Cà phê'],
  [wordRegex(['burger', 'pizza', 'gà rán', 'ga ran', 'fried chicken', 'kfc', 'lotteria', 'jollibee']), 'Đồ nhanh'],
];

const CUISINE_MAP = {
  pho: 'Phở', noodle: 'Bún', noodles: 'Bún', hotpot: 'Lẩu', hot_pot: 'Lẩu',
  barbecue: 'Nướng', bbq: 'Nướng', grill: 'Nướng', rice: 'Cơm',
  japanese: 'Món Nhật', sushi: 'Món Nhật', ramen: 'Món Nhật', korean: 'Món Hàn',
  vegetarian: 'Chay', vegan: 'Chay', coffee_shop: 'Cà phê',
  burger: 'Đồ nhanh', pizza: 'Đồ nhanh', chicken: 'Đồ nhanh', sandwich: 'Đồ nhanh',
  seafood: 'Hải sản', vietnamese: 'Món Việt', regional: 'Món Việt',
};

const AMENITY_MAP = { cafe: 'Cà phê', fast_food: 'Đồ nhanh', ice_cream: 'Kem', food_court: 'Khu ẩm thực' };

function inferFoodTypes(tags, name) {
  const types = new Set();
  for (const [regex, type] of NAME_RULES) {
    if (regex.test(name)) types.add(type);
  }
  for (const c of (tags.cuisine || '').toLowerCase().split(/[;,]/).map((s) => s.trim())) {
    if (CUISINE_MAP[c]) types.add(CUISINE_MAP[c]);
  }
  if (AMENITY_MAP[tags.amenity]) types.add(AMENITY_MAP[tags.amenity]);
  if (types.size === 0) types.add('Nhà hàng');
  return [...types];
}

/// OSM không có thông tin giá — ước lượng thô theo loại hình, ĐÁNH DẤU needsReview ở nơi lưu
/// để người quản trị cập nhật lại; đừng coi đây là số liệu thật.
function inferPriceRange(tags, foodTypes) {
  if (foodTypes.some((t) => ['Nướng', 'Lẩu', 'Món Nhật', 'Món Hàn', 'Hải sản'].includes(t))) return [120000, 350000];
  if (foodTypes.some((t) => ['Phở', 'Bún', 'Cơm'].includes(t))) return [35000, 80000];
  if (tags.amenity === 'cafe') return [25000, 70000];
  if (tags.amenity === 'ice_cream') return [15000, 50000];
  if (tags.amenity === 'fast_food') return [30000, 90000];
  return [50000, 200000];
}

function buildAddress(tags) {
  if (tags['addr:full']) return tags['addr:full'];
  const street = [tags['addr:housenumber'], tags['addr:street']].filter(Boolean).join(' ');
  return [
    street,
    tags['addr:subdistrict'] || tags['addr:suburb'] || tags['addr:quarter'],
    tags['addr:district'] || tags['addr:city_district'],
    tags['addr:city'],
    tags['addr:province'] || tags['addr:state'],
  ]
    .filter(Boolean)
    .join(', ');
}

/// Một phần tử Overpass → dữ liệu địa điểm chuẩn hoá; trả null nếu thiếu tên/toạ độ.
function normalizeElement(el) {
  const tags = el.tags || {};
  const name = String(tags['name:vi'] || tags.name || '').trim();
  const lat = el.lat ?? el.center?.lat;
  const lng = el.lon ?? el.center?.lon;
  if (!name || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  const foodTypes = inferFoodTypes(tags, name);
  const [priceMin, priceMax] = inferPriceRange(tags, foodTypes);
  return {
    externalId: `osm:${el.type}/${el.id}`,
    source: 'osm',
    name,
    lat,
    lng,
    foodTypes,
    priceMin,
    priceMax,
    address: buildAddress(tags), // có thể rỗng — nơi lưu sẽ dùng chữ thay thế
    city: tags['addr:district'] || tags['addr:city_district'] || '',
    province: tags['addr:province'] || tags['addr:state'] || tags['addr:city'] || '',
    openingHours: tags.opening_hours || null,
  };
}

/// Chuẩn hoá tên tỉnh/thành từ Nominatim cho khớp cách đặt tên trong dữ liệu hiện có.
function normalizeProvinceName(raw) {
  if (!raw) return null;
  let name = String(raw).replace(/^(Thành phố|Tỉnh)\s+/i, '').trim();
  if (/^Hồ Chí Minh$/i.test(name)) name = 'TP. Hồ Chí Minh';
  return name;
}

module.exports = { buildQuery, normalizeElement, inferFoodTypes, inferPriceRange, normalizeProvinceName };
