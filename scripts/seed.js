/// Nạp dữ liệu địa điểm THẬT (cấu trúc giống dữ liệu sản xuất) vào MongoDB, thay cho
/// mock data trước đây nằm cứng trong app Flutter. Chạy: npm run seed
///
/// Trong vận hành thực tế, các bản ghi Place nên đến từ một pipeline nội dung/đối tác
/// (source: 'partner_feed' | 'admin') được đồng bộ định kỳ; script này chỉ khởi tạo dữ
/// liệu ban đầu (source: 'seed') để backend có ngay dữ liệu thật để phục vụ API.
require('dotenv').config();
const mongoose = require('mongoose');
const env = require('../src/config/env');
const Place = require('../src/models/Place');

const places = [
  {
    name: 'Phở Thìn Bờ Hồ',
    description:
      'Quán phở nổi tiếng tại Hà Nội với nước dùng đậm đà được ninh từ xương bò trong 12 tiếng, thịt bò tươi mềm. Đã hoạt động hơn 50 năm.',
    foodTypes: ['Phở', 'Món Việt'],
    priceMin: 50000,
    priceMax: 80000,
    rating: 4.7,
    reviewCount: 1284,
    address: '61 Đinh Tiên Hoàng, Hoàn Kiếm, Hà Nội',
    province: 'Hà Nội',
    city: 'Hoàn Kiếm',
    location: { type: 'Point', coordinates: [105.8544, 21.0294] },
    imageUrls: [
      'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=600&h=400&fit=crop&auto=format',
      'https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=600&h=400&fit=crop&auto=format',
    ],
    openingHours: '06:00 – 22:00',
  },
  {
    name: 'Lẩu Cua Đồng Bà Hoa',
    description: 'Lẩu cua đồng dân dã, hương vị quê hương đậm đà với rau sạch từ vườn.',
    foodTypes: ['Lẩu', 'Hải sản'],
    priceMin: 150000,
    priceMax: 300000,
    rating: 4.5,
    reviewCount: 892,
    address: '24 Ngõ Thổ Quan, Đống Đa, Hà Nội',
    province: 'Hà Nội',
    city: 'Đống Đa',
    location: { type: 'Point', coordinates: [105.8265, 21.0175] },
    imageUrls: [
      'https://images.unsplash.com/photo-1559847844-5315695dadae?w=600&h=400&fit=crop&auto=format',
      'https://images.unsplash.com/photo-1567620905732-2d1ec7ab7445?w=600&h=400&fit=crop&auto=format',
    ],
    openingHours: '11:00 – 23:00',
  },
  {
    name: 'Nhà Hàng Bò Nướng Quán Đây',
    description: 'Bò nướng đặc sản với nhiều loại thịt bò tươi ngon, ướp theo công thức bí truyền.',
    foodTypes: ['Nướng', 'Món Hàn'],
    priceMin: 200000,
    priceMax: 450000,
    rating: 4.6,
    reviewCount: 654,
    address: '18 Trần Duy Hưng, Cầu Giấy, Hà Nội',
    province: 'Hà Nội',
    city: 'Cầu Giấy',
    location: { type: 'Point', coordinates: [105.7946, 21.0086] },
    imageUrls: [
      'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=600&h=400&fit=crop&auto=format',
      'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=600&h=400&fit=crop&auto=format',
    ],
    openingHours: '17:00 – 23:30',
  },
  {
    name: 'Cơm Tấm Sài Gòn Ngon',
    description: 'Cơm tấm theo phong cách Nam Bộ với sườn bì chả trứng ốp la, cơm dẻo, nước mắm đặc biệt.',
    foodTypes: ['Cơm', 'Món Việt'],
    priceMin: 45000,
    priceMax: 90000,
    rating: 4.4,
    reviewCount: 2103,
    address: '7 Nguyễn Huy Tưởng, Thanh Xuân, Hà Nội',
    province: 'Hà Nội',
    city: 'Thanh Xuân',
    location: { type: 'Point', coordinates: [105.8010, 20.9977] },
    imageUrls: [
      'https://images.unsplash.com/photo-1476224203421-9ac39bcb3327?w=600&h=400&fit=crop&auto=format',
      'https://images.unsplash.com/photo-1562802378-063ec186a863?w=600&h=400&fit=crop&auto=format',
    ],
    openingHours: '07:00 – 21:00',
  },
  {
    name: 'Sushi Nhật Bản Sakura',
    description: 'Sushi và sashimi tươi ngon theo phong cách Nhật Bản chính thống, nguyên liệu nhập khẩu hàng ngày.',
    foodTypes: ['Món Nhật', 'Sushi'],
    priceMin: 250000,
    priceMax: 600000,
    rating: 4.8,
    reviewCount: 437,
    address: '55 Xuân Diệu, Tây Hồ, Hà Nội',
    province: 'Hà Nội',
    city: 'Tây Hồ',
    location: { type: 'Point', coordinates: [105.8225, 21.0552] },
    imageUrls: [
      'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=600&h=400&fit=crop&auto=format',
      'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=600&h=400&fit=crop&auto=format',
    ],
    openingHours: '11:30 – 22:00',
  },
  {
    name: 'Bánh Mì 25 Hội An',
    description: 'Bánh mì giòn nhân đặc biệt theo công thức gia truyền Hội An.',
    foodTypes: ['Đồ nhanh', 'Món Việt'],
    priceMin: 25000,
    priceMax: 50000,
    rating: 4.6,
    reviewCount: 3210,
    address: '25 Hàng Bài, Hoàn Kiếm, Hà Nội',
    province: 'Hà Nội',
    city: 'Hoàn Kiếm',
    location: { type: 'Point', coordinates: [105.8554, 21.0245] },
    imageUrls: [
      'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=600&h=400&fit=crop&auto=format',
      'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=600&h=400&fit=crop&auto=format',
    ],
    openingHours: '06:00 – 20:00',
  },
  {
    name: 'Cà Phê Rang Tay The Note',
    description: 'Cà phê rang tay specialty với nhiều loại hạt cà phê đặc biệt, không gian yên tĩnh.',
    foodTypes: ['Cà phê', 'Bánh ngọt'],
    priceMin: 35000,
    priceMax: 85000,
    rating: 4.7,
    reviewCount: 1876,
    address: '12 Lê Duẩn, Đống Đa, Hà Nội',
    province: 'Hà Nội',
    city: 'Đống Đa',
    location: { type: 'Point', coordinates: [105.8412, 21.0203] },
    imageUrls: [
      'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?w=600&h=400&fit=crop&auto=format',
      'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=600&h=400&fit=crop&auto=format',
    ],
    openingHours: '07:00 – 22:30',
  },
  {
    name: 'Bún Bò Huế Bà Thìa',
    description: 'Bún bò Huế truyền thống với nước dùng đậm đà, mắm ruốc Huế đặc biệt.',
    foodTypes: ['Bún', 'Món Huế'],
    priceMin: 55000,
    priceMax: 85000,
    rating: 4.5,
    reviewCount: 789,
    address: '33 Phố Huế, Hai Bà Trưng, Hà Nội',
    province: 'Hà Nội',
    city: 'Hai Bà Trưng',
    location: { type: 'Point', coordinates: [105.8517, 21.0166] },
    imageUrls: [
      'https://images.unsplash.com/photo-1476224203421-9ac39bcb3327?w=600&h=400&fit=crop&auto=format',
      'https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=600&h=400&fit=crop&auto=format',
    ],
    openingHours: '06:30 – 14:00',
  },
  // Thêm vài địa điểm ở TP.HCM để minh hoạ tính năng chọn khu vực/tỉnh-thành.
  {
    name: 'Bún Thịt Nướng Cô Ba',
    description: 'Bún thịt nướng chuẩn vị Sài Gòn, nem nướng thơm, nước mắm chua ngọt vừa miệng.',
    foodTypes: ['Bún', 'Món Việt'],
    priceMin: 40000,
    priceMax: 70000,
    rating: 4.5,
    reviewCount: 1523,
    address: '15 Lê Lợi, Quận 1, TP. Hồ Chí Minh',
    province: 'TP. Hồ Chí Minh',
    city: 'Quận 1',
    location: { type: 'Point', coordinates: [106.7009, 10.7756] },
    imageUrls: ['https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=600&h=400&fit=crop&auto=format'],
    openingHours: '10:00 – 21:00',
  },
  {
    name: 'Lẩu Thái Chua Cay Quận 3',
    description: 'Lẩu Thái chua cay đậm vị, hải sản tươi, không gian rộng rãi phù hợp nhóm bạn.',
    foodTypes: ['Lẩu', 'Hải sản'],
    priceMin: 180000,
    priceMax: 350000,
    rating: 4.4,
    reviewCount: 601,
    address: '88 Võ Văn Tần, Quận 3, TP. Hồ Chí Minh',
    province: 'TP. Hồ Chí Minh',
    city: 'Quận 3',
    location: { type: 'Point', coordinates: [106.6883, 10.7796] },
    imageUrls: ['https://images.unsplash.com/photo-1567620905732-2d1ec7ab7445?w=600&h=400&fit=crop&auto=format'],
    openingHours: '10:30 – 22:30',
  },
];

async function run() {
  mongoose.set('strictQuery', true);
  await mongoose.connect(env.mongodbUri);
  console.log(`[seed] Đã kết nối MongoDB (${mongoose.connection.name})`);

  let created = 0;
  let updated = 0;
  for (const p of places) {
    const res = await Place.updateOne(
      { name: p.name, address: p.address },
      { $set: { ...p, source: 'seed', isActive: true, sourceUpdatedAt: new Date() } },
      { upsert: true },
    );
    if (res.upsertedCount > 0) created += 1;
    else updated += 1;
  }

  console.log(`[seed] Hoàn tất — tạo mới ${created}, cập nhật ${updated} địa điểm.`);
  await mongoose.disconnect();
}

run().catch((err) => {
  console.error('[seed] Lỗi:', err);
  process.exit(1);
});
