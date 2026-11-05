require('dotenv').config();

// Đọc & kiểm tra biến môi trường một lần duy nhất khi khởi động server.
function required(name, fallback) {
  const value = process.env[name] ?? fallback;
  if (value === undefined) {
    throw new Error(`Thiếu biến môi trường bắt buộc: ${name} (xem .env.example)`);
  }
  return value;
}

const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '4000', 10),

  mongodbUri: required('MONGODB_URI'),

  jwtSecret: required('JWT_SECRET'),
  // Token sống rất lâu (mặc định 365 ngày): người dùng chỉ cần đăng nhập/đăng ký MỘT LẦN,
  // sau đó thiết bị giữ token cục bộ và dùng lại được kể cả khi mất mạng.
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '365d',

  corsOrigin: process.env.CORS_ORIGIN || '*',

  aiProvider: (process.env.AI_PROVIDER || 'mock').toLowerCase(),
  geminiApiKey: process.env.GEMINI_API_KEY || '',
  geminiModel: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
  groqApiKey: process.env.GROQ_API_KEY || '',
  groqModel: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',

  // Nguồn dữ liệu địa điểm thật — dùng cho scripts/importPlaces.js (xem file đó).
  goongApiKey: process.env.GOONG_API_KEY || '',

  // Nguồn dữ liệu quán có API key (đăng ký bằng email, không cần xác minh danh tính).
  geoapifyApiKey: process.env.GEOAPIFY_API_KEY || '',
  // 'auto' = dùng Geoapify nếu có key, lỗi/không có thì tự chuyển sang OpenStreetMap (Overpass).
  placesProvider: (process.env.PLACES_PROVIDER || 'auto').toLowerCase(),

  // OpenStreetMap (Overpass + Nominatim) — MIỄN PHÍ, KHÔNG cần API key. Chỉ cần một User-Agent
  // nhận diện ứng dụng của bạn (chính sách sử dụng của OSM yêu cầu).
  overpassUrl: process.env.OVERPASS_URL || 'https://overpass-api.de/api/interpreter',
  overpassFallbackUrl: process.env.OVERPASS_FALLBACK_URL || 'https://overpass.kumi.systems/api/interpreter',
  nominatimUrl: process.env.NOMINATIM_URL || 'https://nominatim.openstreetmap.org',
  osmUserAgent: process.env.OSM_USER_AGENT || 'FoodFinder/1.0 (set OSM_USER_AGENT in .env with your contact email)',
};

module.exports = env;
