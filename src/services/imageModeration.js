const env = require('../config/env');

/// Kiểm duyệt ảnh bằng AI thị giác (Google Gemini) — TUỲ CHỌN, bật bằng IMAGE_MODERATION=gemini + GEMINI_API_KEY.
/// Việc AI làm: (1) phát hiện nội dung không phù hợp; (2) phát hiện ảnh KHÔNG liên quan quán ăn (selfie, meme, ảnh chụp
/// màn hình, phong cảnh...). AI KHÔNG thể xác nhận ảnh là của ĐÚNG quán nào — phần đó dựa vào việc có mặt tại quán, người
/// dùng báo cáo và người duyệt (xem photoPolicy.js).
const INSTRUCTION =
  'Bạn kiểm duyệt ảnh cho ứng dụng tìm quán ăn. Trả JSON {"safe": boolean, "relevant": boolean, "category": string, "reason": string}. ' +
  'safe=false nếu ảnh có nội dung khiêu dâm/nhạy cảm, bạo lực, ghê rợn, thù ghét, hoặc lộ rõ mặt trẻ em. ' +
  'relevant=true nếu ảnh là món ăn/đồ uống/thực đơn, không gian bên trong hoặc mặt tiền của quán ăn/quán cà phê. ' +
  'category là một trong: food, drink, menu, interior, exterior, other.';

const SCHEMA = {
  type: 'OBJECT',
  properties: { safe: { type: 'BOOLEAN' }, relevant: { type: 'BOOLEAN' }, category: { type: 'STRING' }, reason: { type: 'STRING' } },
  required: ['safe', 'relevant'],
};

const isConfigured = () => env.imageModeration === 'gemini' && !!env.geminiApiKey;

/// Kết quả JSON của AI → { verdict, reason }. Dữ liệu lạ/thiếu → 'unknown' (không tự duyệt).
function parseVerdict(parsed) {
  if (!parsed || typeof parsed.safe !== 'boolean' || typeof parsed.relevant !== 'boolean') return { verdict: 'unknown', reason: 'Kết quả AI không hợp lệ' };
  if (!parsed.safe) return { verdict: 'unsafe', reason: parsed.reason || 'Nội dung không phù hợp' };
  if (!parsed.relevant) return { verdict: 'irrelevant', reason: parsed.reason || 'Không phải ảnh món ăn/quán ăn' };
  return { verdict: 'ok', reason: parsed.category || '' };
}

async function check(buffer, mimeType) {
  if (!isConfigured()) return { verdict: 'unknown', reason: 'Chưa bật kiểm duyệt AI' };
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${env.geminiModel}:generateContent`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': env.geminiApiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: INSTRUCTION }] },
        contents: [{ role: 'user', parts: [{ text: 'Kiểm duyệt ảnh này.' }, { inline_data: { mime_type: mimeType, data: buffer.toString('base64') } }] }],
        generationConfig: { responseMimeType: 'application/json', responseSchema: SCHEMA, temperature: 0 },
      }),
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) return { verdict: 'unknown', reason: `Gemini HTTP ${res.status}` };
    const data = await res.json();
    // Bộ lọc an toàn của Gemini tự chặn ảnh quá nhạy cảm → coi là không an toàn.
    if (data.promptFeedback && data.promptFeedback.blockReason) return { verdict: 'unsafe', reason: `Bị chặn: ${data.promptFeedback.blockReason}` };
    const text = data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts && data.candidates[0].content.parts[0] && data.candidates[0].content.parts[0].text;
    if (!text) return { verdict: 'unknown', reason: 'AI không trả nội dung' };
    return parseVerdict(JSON.parse(text));
  } catch (err) {
    return { verdict: 'unknown', reason: err.message };
  }
}

module.exports = { check, parseVerdict, isConfigured };
