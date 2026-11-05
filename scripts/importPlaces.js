/// Nhập dữ liệu quán ăn THẬT (tên/địa chỉ/toạ độ) từ Goong Places API vào MongoDB —
/// thay cho việc gõ tay như scripts/seed.js. Đây là nguồn dữ liệu chính thức để dùng
/// trong sản phẩm thật; seed.js chỉ còn là dữ liệu khởi động nhanh cho máy dev trống.
///
/// Cách chạy (xem thêm hướng dẫn lấy GOONG_API_KEY trong README.md):
///   node scripts/importPlaces.js --lat 21.0285 --lng 105.8542 --radius 3 --province "Hà Nội"
///
/// Tuỳ chọn:
///   --lat, --lng     Toạ độ tâm khu vực cần nhập (bắt buộc)
///   --radius         Bán kính tìm kiếm, đơn vị km (mặc định 3)
///   --province       Tên tỉnh/thành để gán cho các địa điểm (bắt buộc, vd "Hà Nội")
///   --keywords       Danh sách từ khoá cách nhau bởi dấu phẩy (mặc định: xem KEYWORD_CATEGORY_MAP)
///   --limit          Số kết quả tối đa lấy cho MỖI từ khoá (mặc định 15)
///
/// LƯU Ý: Goong Places chỉ cung cấp tên/địa chỉ/toạ độ thật — KHÔNG có giá, giờ mở
/// cửa, đánh giá, ảnh (đó không phải dữ liệu họ bán). Các trường này được nhập với
/// giá trị khởi tạo hợp lý và đánh dấu `needsReview: true` — nên rà soát/cập nhật thủ
/// công (hoặc nối thêm một nguồn dữ liệu khác) trước khi dùng cho người dùng thật.
require('dotenv').config();
const mongoose = require('mongoose');
const env = require('../src/config/env');
const Place = require('../src/models/Place');
const goong = require('../src/services/placesSource/goongProvider');

// Từ khoá tìm kiếm ⇄ loại món gán cho kết quả tìm được bằng từ khoá đó — khớp với
// các danh mục món ăn mà app Flutter đã biết (categoryFoodTypeMap trong mock_data.dart).
const KEYWORD_CATEGORY_MAP = {
  'quán phở': ['Phở'],
  'quán bún': ['Bún'],
  'quán lẩu': ['Lẩu'],
  'quán nướng': ['Nướng'],
  'quán cơm': ['Cơm'],
  'nhà hàng nhật': ['Món Nhật'],
  'nhà hàng hàn quốc': ['Món Hàn'],
  'quán ăn chay': ['Chay'],
  'quán cà phê': ['Cà phê'],
  'đồ ăn nhanh': ['Đồ nhanh'],
};

function parseArgs() {
  const args = {};
  for (let i = 2; i < process.argv.length; i += 1) {
    const arg = process.argv[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const next = process.argv[i + 1];
      if (next && !next.startsWith('--')) {
        args[key] = next;
        i += 1;
      } else {
        args[key] = true;
      }
    }
  }
  return args;
}

/// Địa chỉ Việt Nam thường theo thứ tự "..., Phường/Xã, Quận/Huyện, Tỉnh/Thành phố".
/// Suy ra quận/huyện từ đoạn áp chót, phần tỉnh/thành luôn ưu tiên giá trị --province
/// được truyền vào (đáng tin hơn vì do người chạy script xác nhận).
function inferCity(formattedAddress) {
  const parts = formattedAddress.split(',').map((s) => s.trim()).filter(Boolean);
  if (parts.length >= 2) return parts[parts.length - 2];
  return '';
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function run() {
  const args = parseArgs();
  const lat = parseFloat(args.lat);
  const lng = parseFloat(args.lng);
  const radiusKm = parseFloat(args.radius || '3');
  const province = args.province;
  const limit = parseInt(args.limit || '15', 10);
  const keywords = args.keywords ? String(args.keywords).split(',').map((s) => s.trim()) : Object.keys(KEYWORD_CATEGORY_MAP);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    console.error('Thiếu --lat/--lng hợp lệ. Ví dụ: --lat 21.0285 --lng 105.8542');
    process.exit(1);
  }
  if (!province) {
    console.error('Thiếu --province. Ví dụ: --province "Hà Nội"');
    process.exit(1);
  }
  if (!env.goongApiKey) {
    console.error('Thiếu GOONG_API_KEY trong .env — lấy miễn phí tại https://account.goong.io');
    process.exit(1);
  }

  mongoose.set('strictQuery', true);
  await mongoose.connect(env.mongodbUri);
  console.log(`[import] Đã kết nối MongoDB (${mongoose.connection.name})`);
  console.log(`[import] Tâm tìm kiếm: ${lat},${lng} — bán kính ${radiusKm}km — tỉnh/thành: ${province}`);
  console.log(`[import] Từ khoá: ${keywords.join(', ')}`);

  const seenPlaceIds = new Set();
  let created = 0;
  let updated = 0;
  let skipped = 0;
  let failed = 0;

  for (const keyword of keywords) {
    const foodTypes = KEYWORD_CATEGORY_MAP[keyword] || ['Món Việt'];
    let predictions;
    try {
      predictions = await goong.searchNearby({ lat, lng, radiusKm, keyword, limit });
    } catch (err) {
      console.error(`[import] Lỗi tìm "${keyword}":`, err.message);
      failed += 1;
      continue;
    }
    console.log(`[import] "${keyword}" → ${predictions.length} kết quả`);

    for (const prediction of predictions) {
      if (seenPlaceIds.has(prediction.placeId)) {
        skipped += 1;
        continue;
      }
      seenPlaceIds.add(prediction.placeId);

      await sleep(250); // lịch sự với giới hạn tần suất của Goong (free tier)
      let detail;
      try {
        detail = await goong.getDetail(prediction.placeId);
      } catch (err) {
        console.error(`[import] Lỗi lấy chi tiết "${prediction.name}":`, err.message);
        failed += 1;
        continue;
      }
      if (!detail) {
        skipped += 1;
        continue;
      }

      const name = detail.name || prediction.name;
      const address = detail.formattedAddress || prediction.description;
      const city = inferCity(address);

      try {
        const res = await Place.updateOne(
          { name, address },
          {
            $set: {
              name,
              address,
              province,
              city,
              foodTypes,
              location: { type: 'Point', coordinates: [detail.lng, detail.lat] },
              source: 'partner_feed',
              sourceUpdatedAt: new Date(),
              isActive: true,
            },
            $setOnInsert: {
              description: `Dữ liệu nhập tự động từ Goong Places — cần rà soát mô tả, giá, giờ mở cửa và ảnh.`,
              priceMin: 30000,
              priceMax: 150000,
              rating: 0,
              reviewCount: 0,
              imageUrls: [],
              openingHours: null,
              needsReview: true,
            },
          },
          { upsert: true },
        );
        if (res.upsertedCount > 0) created += 1;
        else updated += 1;
      } catch (err) {
        console.error(`[import] Lỗi lưu "${name}":`, err.message);
        failed += 1;
      }
    }
  }

  console.log(
    `[import] Hoàn tất — tạo mới ${created}, cập nhật ${updated}, bỏ qua (trùng/không có toạ độ) ${skipped}, lỗi ${failed}.`,
  );
  if (created + updated > 0) {
    console.log('[import] Nhắc lại: các địa điểm vừa nhập dùng giá/đánh giá/ảnh mặc định — hãy rà soát lại trước khi dùng thật.');
  }
  await mongoose.disconnect();
}

run().catch((err) => {
  console.error('[import] Lỗi không mong muốn:', err);
  process.exit(1);
});
