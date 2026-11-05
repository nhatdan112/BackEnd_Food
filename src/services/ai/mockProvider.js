/// Provider mặc định — KHÔNG gọi API ngoài, không tốn phí, luôn hoạt động.
/// Dùng luật + từ khoá tiếng Việt để "hiểu" prompt thành tiêu chí lọc có cấu trúc.
/// Đây là hàng rào an toàn khi chưa cấu hình AI_PROVIDER=gemini|groq, đồng thời là
/// phần dự phòng (fallback) nếu nhà cung cấp AI thật gặp lỗi/hết hạn mức.
const FOOD_TYPE_KEYWORDS = {
  'Phở': ['phở'],
  'Lẩu': ['lẩu'],
  'Nướng': ['nướng', 'bbq'],
  'Cơm': ['cơm'],
  'Món Nhật': ['nhật', 'sushi', 'sashimi'],
  'Món Hàn': ['hàn', 'kimchi'],
  'Đồ nhanh': ['đồ nhanh', 'fastfood', 'burger', 'gà rán'],
  'Chay': ['chay'],
  'Cà phê': ['cà phê', 'cafe', 'coffee'],
  'Bún': ['bún'],
};

function extractPriceMax(text) {
  // "100k", "100 nghìn", "dưới 150000đ"...
  const kMatch = text.match(/(\d+(?:[.,]\d+)?)\s*k\b/);
  if (kMatch) return Math.round(parseFloat(kMatch[1].replace(',', '.')) * 1000);
  const thousandMatch = text.match(/(\d+)\s*(nghìn|ngàn)/);
  if (thousandMatch) return parseInt(thousandMatch[1], 10) * 1000;
  const plainMatch = text.match(/(\d{4,7})\s*(đ|vnd)?/);
  if (plainMatch) return parseInt(plainMatch[1], 10);
  if (/rẻ|bình dân|sinh viên/.test(text)) return 60000;
  if (/sang trọng|cao cấp|đắt/.test(text)) return null; // không giới hạn giá trên
  return null;
}

function extractDistanceKm(text) {
  const m = text.match(/(\d+(?:[.,]\d+)?)\s*(km|cây số)/);
  if (m) return parseFloat(m[1].replace(',', '.'));
  if (/gần|ngay cạnh|đi bộ/.test(text)) return 1.5;
  return null;
}

function extractMinRating(text) {
  const m = text.match(/(\d(?:[.,]\d)?)\s*(sao|⭐)/);
  if (m) return parseFloat(m[1].replace(',', '.'));
  if (/ngon|chất lượng|đánh giá cao/.test(text)) return 4.3;
  return null;
}

async function parsePrompt(prompt) {
  const text = prompt.toLowerCase();
  const foodTypes = Object.entries(FOOD_TYPE_KEYWORDS)
    .filter(([, keywords]) => keywords.some((k) => text.includes(k)))
    .map(([type]) => type);

  return {
    foodTypes,
    priceMax: extractPriceMax(text),
    maxDistanceKm: extractDistanceKm(text),
    minRating: extractMinRating(text),
    keywords: text.split(/\s+/).filter((w) => w.length > 2).slice(0, 12),
    provider: 'mock',
  };
}

module.exports = { parsePrompt };
