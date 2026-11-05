// Kiểm thử nhập quán ăn thật (OpenStreetMap + Geoapify) — KHÔNG cần MongoDB, mạng hay npm install:
// giả lập `fetch`, `config/env` và model Place. Chạy: node test/placesImport.test.js
const path = require('path');
const assert = require('assert');
const root = path.resolve(__dirname, '..') + path.sep;

const inject = (rel, exp) => { const p = require.resolve(root + rel); require.cache[p] = { id: p, filename: p, loaded: true, exports: exp }; };
const ENV = {
  geoapifyApiKey: '', placesProvider: 'overpass',
  overpassUrl: 'https://primary.test/api', overpassFallbackUrl: 'https://fallback.test/api',
  nominatimUrl: 'https://nominatim.test', osmUserAgent: 'FoodFinderTest/1.0',
};
inject('src/config/env.js', ENV);
let capturedOps = null;
inject('src/models/Place.js', { bulkWrite: async (ops) => { capturedOps = ops; return { upsertedCount: ops.length - 1, modifiedCount: 1 }; } });

const calls = [];
const ELEMENTS = [
  { type: 'node', id: 11, lat: 21.03, lon: 105.85, tags: { amenity: 'restaurant', name: 'Phở Gia Truyền', 'addr:street': 'Bát Đàn', opening_hours: '06:00-21:00' } },
  { type: 'way', id: 22, center: { lat: 21.02, lon: 105.84 }, tags: { amenity: 'cafe', name: 'Cà Phê Muối' } },
  { type: 'node', id: 33, lat: 21.01, lon: 105.83, tags: { amenity: 'cafe' } }, // không tên -> bị loại
];
const GEO_FEATURES = [
  { type: 'Feature', geometry: { type: 'Point', coordinates: [105.848, 21.029] }, properties: { name: 'Phở 10 Lý Quốc Sư', state: 'Hà Nội', city: 'Hà Nội', district: 'Hoàn Kiếm', suburb: 'Hàng Trống', street: 'Lý Quốc Sư', housenumber: '10', lon: 105.848, lat: 21.029, categories: ['catering', 'catering.restaurant', 'catering.restaurant.noodle'], opening_hours: 'Mo-Su 06:00-21:00', place_id: 'p1', datasource: { sourcename: 'openstreetmap', raw: { osm_id: 555, osm_type: 'n', cuisine: 'noodle' } } } },
  { type: 'Feature', geometry: { type: 'Point', coordinates: [105.84, 21.02] }, properties: { name: 'Highlands Coffee', state: 'Hà Nội', city: 'Hà Nội', lon: 105.84, lat: 21.02, categories: ['catering', 'catering.cafe'], place_id: 'xyz' } },
  { type: 'Feature', geometry: { type: 'Point', coordinates: [105.8, 21.0] }, properties: { lon: 105.8, lat: 21.0, categories: ['catering.cafe'], place_id: 'noname' } },
];
let mode = 'normal';
let geoMode = 'ok';
global.fetch = async (url, opts = {}) => {
  const u = String(url);
  calls.push({ url: u, body: opts.body ? String(opts.body) : null, ua: opts.headers && opts.headers['User-Agent'] });
  const json = (status, data) => ({ ok: status < 400, status, json: async () => data, text: async () => '' });
  if (u.startsWith('https://api.geoapify.com')) return geoMode === 'unauth' ? json(401, {}) : json(200, { type: 'FeatureCollection', features: GEO_FEATURES });
  if (u.startsWith('https://nominatim.test')) return json(200, { address: { city: 'Hà Nội', country: 'Việt Nam' } });
  if (u.startsWith('https://primary.test')) {
    if (mode === 'primary429') return json(429, {});
    if (mode === 'primaryRemark') return json(200, { elements: [], remark: 'runtime error: Query timed out in "query" at line 1' });
    if (mode === 'bothFail') return json(504, {});
    return json(200, { elements: ELEMENTS });
  }
  if (u.startsWith('https://fallback.test')) return mode === 'bothFail' ? json(504, {}) : json(200, { elements: ELEMENTS });
  throw new Error('URL bất ngờ: ' + u);
};

(async () => {
  const m = require(root + 'src/services/placesSource/overpassMapper.js');
  // --- mapper OSM ---
  const q = m.buildQuery({ lat: 21.0285, lng: 105.8542, radiusMeters: 2000 });
  assert(q.includes('around:2000,21.0285,105.8542') && q.includes('out center 250;'));
  const node = m.normalizeElement(ELEMENTS[0]);
  assert.deepStrictEqual(node.foodTypes, ['Phở']); assert.strictEqual(node.externalId, 'osm:node/11');
  const way = m.normalizeElement(ELEMENTS[1]);
  assert.strictEqual(way.lat, 21.02); assert(way.foodTypes.includes('Cà phê')); assert.strictEqual(way.address, '');
  assert.strictEqual(m.normalizeElement(ELEMENTS[2]), null);
  assert(!m.inferFoodTypes({ amenity: 'restaurant' }, 'Photo Studio').includes('Phở'));
  assert.strictEqual(m.normalizeProvinceName('Thành phố Hồ Chí Minh'), 'TP. Hồ Chí Minh');
  console.log('✔ Mapper OpenStreetMap');

  // --- provider Overpass ---
  const overpass = require(root + 'src/services/placesSource/overpassProvider.js');
  mode = 'primary429'; calls.length = 0;
  assert.strictEqual((await overpass.fetchNearby({ lat: 21, lng: 105, radiusKm: 2 })).length, 3);
  assert.deepStrictEqual(calls.map((c) => c.url.split('/')[2]), ['primary.test', 'fallback.test']);
  assert.strictEqual(calls[0].ua, 'FoodFinderTest/1.0');
  mode = 'primaryRemark'; calls.length = 0;
  await overpass.fetchNearby({ lat: 21, lng: 105, radiusKm: 2 }); assert.strictEqual(calls.length, 2);
  mode = 'bothFail';
  await assert.rejects(() => overpass.fetchNearby({ lat: 1, lng: 1, radiusKm: 1 }), /HTTP 504/);
  console.log('✔ Overpass: chuyển máy chủ dự phòng, phát hiện "HTTP 200 + remark", ném lỗi khi cả hai hỏng');

  // --- importNearby ---
  mode = 'normal'; calls.length = 0;
  const { importNearby } = require(root + 'src/services/placesImport.js');
  let sm = await importNearby({ lat: 21.03, lng: 105.85, radiusKm: 50 });
  assert.strictEqual(sm.radiusKm, 5); assert(calls[0].body.includes('around%3A5000'));
  assert.deepStrictEqual([sm.fetched, sm.usable, sm.created, sm.updated, sm.provider], [3, 2, 1, 1, 'overpass']);
  assert.strictEqual(sm.province, 'Hà Nội');
  const [pho, cafe] = capturedOps.map((o) => o.updateOne);
  assert.deepStrictEqual(pho.filter, { externalId: 'osm:node/11' }); assert(pho.upsert);
  assert.deepStrictEqual(pho.update.$set.location.coordinates, [105.85, 21.03]);
  assert.strictEqual(cafe.update.$setOnInsert.address, 'Chưa có địa chỉ trên OpenStreetMap');
  assert.strictEqual('address' in cafe.update.$set, false); assert.strictEqual('openingHours' in cafe.update.$set, false);
  for (const o of capturedOps) {
    assert.deepStrictEqual(Object.keys(o.updateOne.update.$set).filter((k) => k in o.updateOne.update.$setOnInsert), []);
    assert.strictEqual(o.updateOne.update.$setOnInsert.needsReview, true);
  }
  calls.length = 0;
  sm = await importNearby({ lat: 10.77, lng: 106.7, radiusKm: 1, province: 'Thành phố Hồ Chí Minh' });
  assert.strictEqual(sm.province, 'TP. Hồ Chí Minh'); assert(!calls.some((c) => c.url.startsWith('https://nominatim.test')));
  console.log('✔ importNearby (OSM): kẹp bán kính 5km · upsert đúng · không ghi đè dữ liệu chỉnh tay · tra tỉnh/thành');

  // --- Geoapify ---
  const gm = require(root + 'src/services/placesSource/geoapifyMapper.js');
  const params = gm.buildParams({ lat: 21.03, lng: 105.85, radiusMeters: 2000, apiKey: 'K' });
  assert.strictEqual(params.filter, 'circle:105.85,21.03,2000'); assert.strictEqual(params.bias, 'proximity:105.85,21.03');
  const f1 = gm.normalizeFeature(GEO_FEATURES[0]);
  assert.strictEqual(f1.externalId, 'osm:node/555');
  assert(f1.foodTypes.includes('Phở') && f1.foodTypes.includes('Bún'));
  assert.strictEqual(f1.address, '10 Lý Quốc Sư, Hàng Trống, Hoàn Kiếm, Hà Nội');
  assert.strictEqual(f1.province, 'Hà Nội'); assert.strictEqual(f1.city, 'Hoàn Kiếm');
  const f2 = gm.normalizeFeature(GEO_FEATURES[1]);
  assert.strictEqual(f2.externalId, 'geoapify:xyz'); assert.strictEqual(f2.address, 'Hà Nội');
  assert.strictEqual(gm.normalizeFeature(GEO_FEATURES[2]), null);
  console.log('✔ Mapper Geoapify');

  ENV.geoapifyApiKey = 'SECRET-KEY-123'; ENV.placesProvider = 'auto'; calls.length = 0;
  sm = await importNearby({ lat: 21.03, lng: 105.85, radiusKm: 2, province: 'Hà Nội' });
  assert.strictEqual(sm.provider, 'geoapify'); assert.strictEqual(sm.usable, 2);
  const g = calls.find((c) => c.url.startsWith('https://api.geoapify.com'));
  assert(g.url.includes('categories=catering.restaurant') && g.url.includes('apiKey=SECRET-KEY-123'));
  assert(!calls.some((c) => c.url.includes('primary.test')));
  assert.strictEqual(capturedOps[0].updateOne.update.$set.source, 'geoapify');
  geoMode = 'unauth';
  sm = await importNearby({ lat: 21.03, lng: 105.85, radiusKm: 2, province: 'Hà Nội' });
  assert.strictEqual(sm.provider, 'overpass');
  ENV.placesProvider = 'geoapify'; let msg = '';
  await importNearby({ lat: 21.03, lng: 105.85, radiusKm: 2, province: 'Hà Nội' }).catch((e) => { msg = e.message; });
  assert(/không hợp lệ/.test(msg) && !msg.includes('SECRET-KEY-123'));
  ENV.placesProvider = 'auto'; ENV.geoapifyApiKey = ''; geoMode = 'ok'; calls.length = 0;
  sm = await importNearby({ lat: 21.03, lng: 105.85, radiusKm: 2, province: 'Hà Nội' });
  assert.strictEqual(sm.provider, 'overpass'); assert(!calls.some((c) => c.url.includes('geoapify')));
  console.log('✔ Chọn nguồn: có key→Geoapify · key sai→tự rơi về OSM · ép Geoapify→báo lỗi không lộ key · không key→OSM');
  console.log('\nTẤT CẢ KIỂM THỬ ĐẠT');
})().catch((e) => { console.error('THẤT BẠI:', e); process.exit(1); });
