const env = require('../../config/env');
const mockProvider = require('./mockProvider');

/// Provider dùng Groq API (gói miễn phí, tốc độ rất nhanh — lấy key tại
/// https://console.groq.com/keys). API tương thích chuẩn OpenAI nên chỉ cần fetch thường.
const SYSTEM_PROMPT =
  'Bạn là bộ phân tích yêu cầu tìm quán ăn bằng tiếng Việt. ' +
  'Trả lời DUY NHẤT một JSON object với các khoá: ' +
  'foodTypes (mảng string, chỉ chọn trong: Phở, Lẩu, Nướng, Cơm, Món Nhật, Món Hàn, Đồ nhanh, Chay, Cà phê, Bún), ' +
  'priceMax (số VNĐ hoặc null), maxDistanceKm (số hoặc null), minRating (số 0-5 hoặc null), keywords (mảng string). ' +
  'Không thêm chữ nào khác ngoài JSON.';

async function parsePrompt(prompt) {
  if (!env.groqApiKey) {
    console.warn('[ai:groq] Thiếu GROQ_API_KEY — dùng tạm mockProvider.');
    return mockProvider.parsePrompt(prompt);
  }

  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.groqApiKey}` },
    body: JSON.stringify({
      model: env.groqModel,
      response_format: { type: 'json_object' },
      temperature: 0.2,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: prompt },
      ],
    }),
    signal: AbortSignal.timeout(15000),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Groq API lỗi ${res.status}: ${errText.slice(0, 300)}`);
  }

  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content;
  if (!text) throw new Error('Groq API không trả về nội dung.');

  const parsed = JSON.parse(text);
  return {
    foodTypes: Array.isArray(parsed.foodTypes) ? parsed.foodTypes : [],
    priceMax: typeof parsed.priceMax === 'number' ? parsed.priceMax : null,
    maxDistanceKm: typeof parsed.maxDistanceKm === 'number' ? parsed.maxDistanceKm : null,
    minRating: typeof parsed.minRating === 'number' ? parsed.minRating : null,
    keywords: Array.isArray(parsed.keywords) ? parsed.keywords : [],
    provider: 'groq',
  };
}

module.exports = { parsePrompt };
