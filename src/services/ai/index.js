const env = require('../../config/env');
const mockProvider = require('./mockProvider');
const geminiProvider = require('./geminiProvider');
const groqProvider = require('./groqProvider');

/// ĐIỂM TÍCH HỢP AI DUY NHẤT của toàn bộ backend.
///
/// Mọi provider đều triển khai cùng một "hợp đồng":
///   async parsePrompt(promptText) -> {
///     foodTypes: string[], priceMax: number|null, maxDistanceKm: number|null,
///     minRating: number|null, keywords: string[], provider: string
///   }
///
/// Muốn đổi/thêm nguồn AI thật: viết thêm một file cùng thư mục này với đúng hàm
/// parsePrompt(prompt), rồi đăng ký vào PROVIDERS bên dưới và đặt AI_PROVIDER trong .env.
/// aiController sẽ TỰ ĐỘNG dùng tiêu chí trả về để truy vấn MongoDB thật — không cần
/// sửa gì ở controller/route khi đổi provider.
const PROVIDERS = {
  mock: mockProvider,
  gemini: geminiProvider,
  groq: groqProvider,
};

function getProvider() {
  return PROVIDERS[env.aiProvider] || mockProvider;
}

async function parsePrompt(prompt) {
  const provider = getProvider();
  try {
    return await provider.parsePrompt(prompt);
  } catch (err) {
    console.error(`[ai:${env.aiProvider}] Lỗi khi gọi AI provider, dùng tạm mockProvider:`, err.message);
    const fallback = await mockProvider.parsePrompt(prompt);
    return { ...fallback, providerError: err.message };
  }
}

module.exports = { parsePrompt, getProvider };
