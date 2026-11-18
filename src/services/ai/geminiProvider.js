const env = require('../../config/env');
const mockProvider = require('./mockProvider');

/// Provider dùng Google Gemini API (gói miễn phí — lấy key tại
/// https://aistudio.google.com/app/apikey, không cần thẻ thanh toán).
/// Gọi thẳng REST endpoint bằng fetch (Node >= 18 có sẵn) để không phụ thuộc SDK
/// nào có thể đổi phiên bản — chỉ cần đúng GEMINI_API_KEY là chạy được.
const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    foodTypes: { type: 'ARRAY', items: { type: 'STRING' } },
    priceMax: { type: 'NUMBER', nullable: true },
    maxDistanceKm: { type: 'NUMBER', nullable: true },
    minRating: { type: 'NUMBER', nullable: true },
    keywords: { type: 'ARRAY', items: { type: 'STRING' } },
  },
  required: ['foodTypes', 'keywords'],
};

const SYSTEM_INSTRUCTION =
  'Bạn là bộ phân tích yêu cầu tìm quán ăn bằng tiếng Việt. ' +
  'Từ câu yêu cầu của người dùng, hãy trích ra tiêu chí lọc dưới dạng JSON đúng schema đã cho. ' +
  'foodTypes chỉ được chọn trong danh sách: Phở, Lẩu, Nướng, Cơm, Món Nhật, Món Hàn, Đồ nhanh, Chay, Cà phê, Bún. ' +
  'Nếu không chắc một trường, để null (hoặc mảng rỗng). Không giải thích, chỉ trả JSON.';

async function parsePrompt(prompt) {
  if (!env.geminiApiKey) {
    console.warn('[ai:gemini] Thiếu GEMINI_API_KEY — dùng tạm mockProvider.');
    return mockProvider.parsePrompt(prompt);
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${env.geminiModel}:generateContent`;
  const body = {
    systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: RESPONSE_SCHEMA,
      temperature: 0.2,
    },
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': env.geminiApiKey },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Gemini API lỗi ${res.status}: ${errText.slice(0, 300)}`);
  }

  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('Gemini API không trả về nội dung.');

  const parsed = JSON.parse(text);
  return {
    foodTypes: Array.isArray(parsed.foodTypes) ? parsed.foodTypes : [],
    priceMax: typeof parsed.priceMax === 'number' ? parsed.priceMax : null,
    maxDistanceKm: typeof parsed.maxDistanceKm === 'number' ? parsed.maxDistanceKm : null,
    minRating: typeof parsed.minRating === 'number' ? parsed.minRating : null,
    keywords: Array.isArray(parsed.keywords) ? parsed.keywords : [],
    provider: 'gemini',
  };
}

module.exports = { parsePrompt };
