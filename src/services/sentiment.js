/// Phân tích cảm xúc bình luận tiếng Việt — thuật toán dựa trên TỪ ĐIỂN có trọng số (lexicon-based), minh bạch và
/// giải thích được (phù hợp trình bày trong báo cáo), không cần dữ liệu huấn luyện hay dịch vụ ngoài.
///
/// Các bước (xem docs/BAO_CAO_DO_AN.md, mục thuật toán):
///  1. Chuẩn hoá: chữ thường, tách mệnh đề theo dấu câu và từ nối tương phản ("nhưng", "tuy nhiên"...).
///  2. Tra từ điển theo cụm dài nhất trước (3 → 1 từ). Tra theo dạng CÓ DẤU; nếu không thấy thì tra theo dạng BỎ DẤU
///     (người dùng hay gõ không dấu) — trừ các cặp bỏ dấu trùng nhau mà trái nghĩa (vd "ổn"/"ồn") thì chỉ tra có dấu.
///  3. Hiệu chỉnh: phủ định trong 2 từ trước ("không ngon" → âm), từ nhấn mạnh ("rất", "quá" ×1,4), từ giảm nhẹ
///     ("hơi", "khá" ×0,7), "không ... lắm" làm yếu đi, emoji.
///  4. Cộng điểm các mệnh đề (mệnh đề sau "nhưng" ×1,3) → chuẩn hoá bằng tanh(tổng/3) ∈ (−1, 1).
///  5. Nhãn: điểm > 0,2 → tích cực; < −0,2 → tiêu cực; còn lại trung lập. Không có từ cảm xúc nào → dùng số sao.
///  6. Khía cạnh (aspect): mệnh đề chứa từ khoá khía cạnh (món ăn / giá cả / phục vụ / không gian) gán điểm của mệnh đề cho khía cạnh đó.

const DIACRITIC_GROUPS = {
  a: 'àáảãạăằắẳẵặâầấẩẫậ', e: 'èéẻẽẹêềếểễệ', i: 'ìíỉĩị', o: 'òóỏõọôồốổỗộơờớởỡợ', u: 'ùúủũụưừứửữự', y: 'ỳýỷỹỵ', d: 'đ',
};

function fold(input) {
  let out = String(input).toLowerCase();
  for (const [base, chars] of Object.entries(DIACRITIC_GROUPS)) {
    for (const ch of chars) out = out.split(ch).join(base);
  }
  return out;
}

// Từ điển cảm xúc: cụm từ (có dấu) → trọng số −3 … +3.
const LEXICON = {
  // tích cực
  'ngon': 2, 'rất ngon': 2.8, 'ngon miệng': 2, 'đã miệng': 2, 'đậm đà': 1.5, 'vừa miệng': 1.5, 'thơm': 1, 'thơm ngon': 2, 'tươi': 1,
  'tươi ngon': 2, 'hấp dẫn': 1.5, 'tuyệt': 2.5, 'tuyệt vời': 3, 'tuyệt hảo': 3, 'xuất sắc': 3, 'hoàn hảo': 3, 'chất lượng': 1,
  'sạch': 1.5, 'sạch sẽ': 2, 'thoải mái': 1.5, 'thoáng': 1, 'rộng rãi': 1, 'mát mẻ': 1, 'ấm cúng': 1.5, 'đẹp': 1, 'view đẹp': 1.5,
  'thân thiện': 2, 'nhiệt tình': 2, 'chu đáo': 2, 'dễ thương': 1.5, 'lịch sự': 1.5, 'phục vụ tốt': 2, 'nhanh': 1, 'nhanh chóng': 1.5,
  'rẻ': 1.5, 'hợp lý': 1.5, 'bình dân': 0.5, 'đáng tiền': 2.5, 'đáng thử': 2, 'đáng đi': 2, 'đáng ăn': 2, 'đáng nhớ': 2, 'đáng giá': 2,
  'tốt': 1.5, 'ổn': 0.8, 'ok': 0.5, 'khuyên dùng': 2, 'recommend': 2, 'giới thiệu': 1, 'yêu thích': 2, 'hài lòng': 2, 'ấn tượng': 2,
  'nghiện': 2, 'ủng hộ': 1.5, 'quay lại': 1.5, 'sẽ quay lại': 2, 'phải thử': 2, 'ngon tuyệt': 3, 'tuyệt cú mèo': 3, 'ngon nhất': 3,
  'mê': 1.5, 'thích': 1.5, 'tuyệt đối': 0.5, 'chuẩn vị': 2, 'đúng vị': 2, 'hợp khẩu vị': 2, 'vừa ý': 1.5, 'cảm ơn': 1,
  // tiêu cực
  'dở': -2.5, 'tệ': -3, 'tệ hại': -3, 'kém': -2, 'dở tệ': -3, 'nhạt': -1.5, 'nhạt nhẽo': -2, 'mặn': -1, 'dầu mỡ': -1.5, 'khô': -1,
  'ôi': -1.5, 'thiu': -3, 'ôi thiu': -3, 'hôi': -2.5, 'tanh': -2, 'dơ': -2.5, 'bẩn': -2.5, 'mất vệ sinh': -3, 'gián': -2.5, 'ruồi': -2,
  'đắt': -1.5, 'mắc': -1.5, 'đắt đỏ': -2, 'chặt chém': -3, 'lừa đảo': -3, 'phí tiền': -3, 'không đáng': -2, 'không đáng tiền': -2.5,
  'chậm': -1.5, 'lâu': -1, 'chờ lâu': -2, 'đợi lâu': -2, 'quá lâu': -2, 'chờ đợi': -1, 'ồn': -1.5, 'ồn ào': -2, 'chật': -1.5, 'nóng': -0.5,
  'thất vọng': -2.5, 'chán': -1.5, 'tồi': -2.5, 'tồi tệ': -3, 'khó chịu': -2.5, 'bực': -2, 'cáu': -2, 'thái độ': -0.2, 'thái độ tệ': -3,
  'không thân thiện': -2, 'không nhiệt tình': -2, 'bực mình': -2.5, 'không bao giờ quay lại': -3, 'không quay lại': -2.5, 'sẽ không quay lại': -3,
  'không ngon': -2, 'không sạch': -2, 'không hài lòng': -2.5, 'đừng đến': -3, 'tránh xa': -3, 'phí': -1.5, 'sai': -1.5, 'thiếu': -1.5, 'lạnh ngắt': -2,
};

// Từ chức năng (phủ định / nhấn mạnh / giảm nhẹ / nối). Mỗi nhóm có dạng CÓ DẤU (luôn dùng) và dạng BỎ DẤU (chỉ dùng khi
// từ trong bình luận thật sự không dấu). Một số dạng bỏ dấu bị chặn vì trùng từ khác phổ biến trong ẩm thực:
// "chưa" ≈ "chua" (canh chua), "đau" ≈ "đâu". Lưu ý: KHÔNG coi "chả" là phủ định — "chả" là món (bún chả, chả cá).
const FOLD_BLOCK = new Set(['chua', 'dau']);
const makeGroup = (list) => ({ raw: new Set(list), folded: new Set(list.map(fold).filter((k) => !FOLD_BLOCK.has(k))) });
const isFn = (group, tok) => !!tok && (group.raw.has(tok) || (tok === fold(tok) && group.folded.has(tok)));

const NEG = makeGroup(['không', 'chẳng', 'chưa', 'hổng', 'ko', 'k', 'chẳng hề', 'không hề']);
const BOOST = makeGroup(['rất', 'quá', 'cực', 'siêu', 'vô cùng', 'cực kỳ', 'hết sảy', 'thật sự', 'thực sự', 'khá là', 'rất là']);
const DAMP = makeGroup(['hơi', 'khá', 'tương đối', 'tạm', 'tạm được', 'cũng']);
const SUFFIX = makeGroup(['quá', 'lắm', 'ghê', 'thật', 'luôn', 'vô cùng']);
const CONTRAST = makeGroup(['nhưng', 'tuy nhiên', 'nhưng mà', 'có điều']); // không dùng "song": bỏ dấu trùng "sông"

const POSITIVE_EMOJI = ['😍', '😋', '🥰', '❤', '👍', '😊', '🤩', '💯', '😘', '👏', '🥳'];
const NEGATIVE_EMOJI = ['😡', '🤮', '😤', '👎', '😠', '🤢', '😞', '😭', '💩', '😒'];

// Khía cạnh → từ khoá (CÓ DẤU). Chỉ khi cả mệnh đề gõ không dấu mới tra theo dạng bỏ dấu (và bỏ các khoá mơ hồ).
const ASPECTS = {
  food: ['ngon', 'dở', 'nhạt', 'mặn', 'thơm', 'tươi', 'vị', 'món', 'đồ ăn', 'đồ uống', 'nước dùng', 'khẩu phần', 'phần ăn', 'dầu mỡ', 'thiu', 'hôi', 'tanh', 'đậm đà', 'chất lượng'],
  price: ['giá', 'đắt', 'mắc', 'rẻ', 'đáng tiền', 'hợp lý', 'chặt chém', 'phí tiền', 'bình dân', 'tiền'],
  service: ['phục vụ', 'nhân viên', 'thái độ', 'chờ', 'đợi', 'chậm', 'nhanh', 'nhiệt tình', 'chu đáo', 'thân thiện', 'cáu', 'lịch sự', 'order'],
  ambience: ['không gian', 'view', 'sạch', 'dơ', 'bẩn', 'ồn', 'rộng', 'chật', 'thoải mái', 'mát', 'nóng', 'đông', 'vệ sinh', 'bàn ghế', 'chỗ ngồi', 'nhạc', 'gửi xe', 'đậu xe', 'ấm cúng', 'thoáng'],
};
const ASPECT_LABELS = { food: 'Món ăn', price: 'Giá cả', service: 'Phục vụ', ambience: 'Không gian' };

const RESERVED_FOLDED = new Set([NEG, BOOST, DAMP, SUFFIX, CONTRAST].flatMap((g) => [...g.folded]));

// Chỉ mục tra theo dạng bỏ dấu — chỉ dùng khi người dùng gõ KHÔNG DẤU. Loại các khoá mơ hồ: trùng giữa hai cụm có dấu
// khác nhau ("ổn"/"ồn") hoặc trùng từ chức năng ("hơi" ≈ "hôi").
const FOLDED_INDEX = (() => {
  const idx = new Map();
  const ambiguous = new Set();
  for (const [phrase, weight] of Object.entries(LEXICON)) {
    const key = fold(phrase);
    if (idx.has(key) && idx.get(key).phrase !== phrase) ambiguous.add(key);
    else idx.set(key, { phrase, weight });
  }
  for (const key of ambiguous) idx.delete(key);
  for (const key of RESERVED_FOLDED) idx.delete(key);
  return idx;
})();

function lookup(rawPhrase) {
  if (Object.prototype.hasOwnProperty.call(LEXICON, rawPhrase)) return { phrase: rawPhrase, weight: LEXICON[rawPhrase] };
  // Có dấu thì tin vào dấu: "hơi" không phải "hôi". Chỉ tra bỏ dấu khi cả cụm thật sự không dấu.
  if (rawPhrase !== fold(rawPhrase)) return null;
  return FOLDED_INDEX.get(rawPhrase) || null;
}

function tokenize(clause) {
  return clause
    .toLowerCase()
    .replace(/[“”"'()\[\]{}…]/g, ' ')
    .split(/[\s,]+/)
    .map((t) => t.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ''))
    .filter(Boolean);
}

/// Tách thành các mệnh đề; đánh dấu mệnh đề đứng SAU từ nối tương phản (được nhấn mạnh hơn).
function splitClauses(text) {
  const parts = String(text).split(/[.!?;\n]+/).map((s) => s.trim()).filter(Boolean);
  const clauses = [];
  for (const part of parts) {
    const folded = fold(part);
    let rest = part;
    let emphasised = false;
    // tách tại "nhưng", "tuy nhiên"... (so khớp trên dạng bỏ dấu, cắt theo vị trí tương ứng — dạng bỏ dấu giữ nguyên độ dài)
    const re = /(?:^|\s)(nhung ma|nhung|tuy nhien|co dieu)(?=\s|$)/g;
    let last = 0;
    let m;
    const segs = [];
    while ((m = re.exec(folded)) !== null) {
      const cut = m.index + (m[0].startsWith(' ') ? 1 : 0);
      segs.push({ text: rest.slice(last, cut), emphasised });
      last = cut + m[1].length;
      emphasised = true;
    }
    segs.push({ text: rest.slice(last), emphasised });
    for (const s of segs) if (s.text.trim()) clauses.push({ text: s.text.trim(), emphasised: s.emphasised });
  }
  return clauses;
}

function scoreClause(clause) {
  const tokens = tokenize(clause);
  const matched = [];
  let total = 0;
  let i = 0;
  while (i < tokens.length) {
    let hit = null;
    let len = 0;
    for (const n of [5, 4, 3, 2, 1]) {
      if (i + n > tokens.length) continue;
      const found = lookup(tokens.slice(i, i + n).join(' '));
      if (found) { hit = found; len = n; break; }
    }
    if (!hit) { i += 1; continue; }

    let weight = hit.weight;
    // Phủ định / nhấn mạnh trong 2 từ đứng trước.
    let negated = false;
    let boost = 1;
    for (let back = 1; back <= 2; back += 1) {
      const prev = tokens[i - back];
      if (prev === undefined) break;
      const prev2 = tokens[i - back - 1] ? `${tokens[i - back - 1]} ${prev}` : null;
      if (isFn(NEG, prev) || isFn(NEG, prev2)) negated = true;
      if (isFn(BOOST, prev) || isFn(BOOST, prev2)) boost = 1.4;
      if (isFn(DAMP, prev) || isFn(DAMP, prev2)) boost = 0.7;
    }
    const next = tokens[i + len];
    const softened = negated && ['lắm', 'mấy', 'lam', 'may'].includes(next);
    if (isFn(SUFFIX, next) && !negated) boost = Math.max(boost, 1.4);

    if (negated) {
      weight = weight > 0 ? -0.8 * weight : 0.5 * Math.abs(weight); // "không ngon" → âm; "không tệ" → dương nhẹ
      if (softened) weight *= 0.5;
    }
    weight *= boost;
    matched.push({ term: hit.phrase, weight: Math.round(weight * 100) / 100, negated });
    total += weight;
    i += len;
  }
  return { total, matched, tokens };
}

function emojiScore(text) {
  let s = 0;
  for (const e of POSITIVE_EMOJI) s += (text.split(e).length - 1) * 1.5;
  for (const e of NEGATIVE_EMOJI) s -= (text.split(e).length - 1) * 2;
  return s;
}

// Khoá bỏ dấu của khía cạnh: loại khoá trùng giữa các từ có dấu khác nhau hoặc trùng từ chức năng.
const ASPECT_FOLDED = (() => {
  const owners = new Map();
  for (const [aspect, terms] of Object.entries(ASPECTS)) {
    for (const t of terms) {
      const key = fold(t);
      if (!owners.has(key)) owners.set(key, new Set());
      owners.get(key).add(`${aspect}:${t}`);
    }
  }
  const out = {};
  for (const [aspect, terms] of Object.entries(ASPECTS)) {
    out[aspect] = terms.map(fold).filter((k) => owners.get(k).size === 1 && !RESERVED_FOLDED.has(k));
  }
  return out;
})();

function aspectsInClause(tokens) {
  const raw = ` ${tokens.join(' ')} `;
  const unaccented = raw === fold(raw);
  const found = [];
  for (const [aspect, terms] of Object.entries(ASPECTS)) {
    const hit = terms.some((t) => raw.includes(` ${t} `)) || (unaccented && ASPECT_FOLDED[aspect].some((k) => raw.includes(` ${k} `)));
    if (hit) found.push(aspect);
  }
  return found;
}

function labelFor(score) {
  if (score > 0.2) return 'positive';
  if (score < -0.2) return 'negative';
  return 'neutral';
}

function labelFromRating(rating) {
  if (rating >= 4) return 'positive';
  if (rating <= 2) return 'negative';
  return 'neutral';
}

/// Phân tích một bình luận. `rating` (1–5, tuỳ chọn) chỉ dùng khi bình luận trống/không có từ cảm xúc nào.
function analyze(text, rating) {
  const clean = String(text || '').trim();
  if (!clean) {
    return { score: 0, label: rating ? labelFromRating(rating) : 'neutral', source: rating ? 'rating' : 'none', matched: [], aspects: {}, keywords: [] };
  }
  const clauses = splitClauses(clean);
  let total = emojiScore(clean);
  const matched = [];
  const aspectScores = {};
  for (const clause of clauses) {
    const { total: ct, matched: cm, tokens } = scoreClause(clause.text);
    const weighted = ct * (clause.emphasised ? 1.3 : 1);
    total += weighted;
    matched.push(...cm);
    if (cm.length > 0) {
      const normalized = Math.tanh(weighted / 3);
      for (const aspect of aspectsInClause(tokens)) {
        aspectScores[aspect] = aspectScores[aspect] === undefined ? normalized : (aspectScores[aspect] + normalized) / 2;
      }
    }
  }
  const score = Math.round(Math.tanh(total / 3) * 1000) / 1000;
  const hasSignal = matched.length > 0 || Math.abs(emojiScore(clean)) > 0;
  const label = hasSignal ? labelFor(score) : rating ? labelFromRating(rating) : 'neutral';
  const keywords = matched
    .filter((m) => Math.abs(m.weight) >= 0.8)
    .map((m) => ({ term: m.term, polarity: m.weight > 0 ? 'positive' : 'negative' }));
  const aspects = {};
  for (const [k, v] of Object.entries(aspectScores)) aspects[k] = Math.round(v * 1000) / 1000;
  return { score, label, source: hasSignal ? 'text' : rating ? 'rating' : 'none', matched, aspects, keywords };
}

module.exports = { analyze, fold, labelFor, labelFromRating, ASPECT_LABELS, LEXICON };
