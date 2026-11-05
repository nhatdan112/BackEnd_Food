/// Nhập quán ăn THẬT từ OpenStreetMap (miễn phí, không cần API key) vào MongoDB theo dòng lệnh —
/// dùng để nạp sẵn dữ liệu cho cả một thành phố mà không phải chờ người dùng bấm nút trong app.
///
///   node scripts/importOverpass.js --lat 21.0285 --lng 105.8542 --radius 5 --province "Hà Nội"
///
/// Tuỳ chọn: --radius (km, tối đa 5, mặc định 2) · --province (nếu bỏ qua sẽ tự tra từ toạ độ).
/// Muốn phủ rộng hơn 5km: chạy nhiều lần với các toạ độ tâm khác nhau (cách nhau ~6-8km),
/// nghỉ vài giây giữa các lần để lịch sự với máy chủ Overpass công cộng.
require('dotenv').config();
const mongoose = require('mongoose');
const env = require('../src/config/env');
const { importNearby } = require('../src/services/placesImport');

function parseArgs() {
  const args = {};
  for (let i = 2; i < process.argv.length; i += 1) {
    if (process.argv[i].startsWith('--')) {
      args[process.argv[i].slice(2)] = process.argv[i + 1];
      i += 1;
    }
  }
  return args;
}

async function run() {
  const args = parseArgs();
  const lat = parseFloat(args.lat);
  const lng = parseFloat(args.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    console.error('Thiếu --lat/--lng. Ví dụ: --lat 21.0285 --lng 105.8542 --radius 5 --province "Hà Nội"');
    process.exit(1);
  }
  await mongoose.connect(env.mongodbUri);
  console.log(`[import] Đã kết nối MongoDB (${mongoose.connection.name}) — đang lấy dữ liệu từ OpenStreetMap...`);
  const summary = await importNearby({ lat, lng, radiusKm: parseFloat(args.radius || '2'), province: args.province });
  console.log(
    `[import] Bán kính ${summary.radiusKm}km · tỉnh/thành "${summary.province}" · OSM trả ${summary.fetched} phần tử, ` +
      `dùng được ${summary.usable} · tạo mới ${summary.created} · cập nhật ${summary.updated}.`,
  );
  console.log('[import] Các quán mới có needsReview=true (giá/ảnh/đánh giá là giá trị tạm) — nên rà soát trước khi dùng thật.');
  await mongoose.disconnect();
}

run().catch((err) => {
  console.error('[import] Lỗi:', err.message);
  process.exit(1);
});
