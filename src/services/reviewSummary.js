/// Tóm tắt đánh giá của một quán (logic thuần, kiểm thử được): phân bố sao, điểm trung bình, điểm Bayesian,
/// tỷ lệ cảm xúc, cảm xúc theo khía cạnh và từ khoá nổi bật.
const { labelFor, labelFromRating, ASPECT_LABELS } = require('./sentiment');

const PRIOR_WEIGHT = 5; // m: một quán cần khoảng 5 đánh giá để điểm riêng của nó "át" điểm trung bình chung
const DEFAULT_GLOBAL_MEAN = 3.8;

/// Điểm trung bình có trọng số (Bayesian average — công thức xếp hạng của IMDb):
///   WR = v/(v+m) · R + m/(v+m) · C
/// R: điểm trung bình của quán, v: số đánh giá, m: trọng số tiên nghiệm, C: điểm trung bình toàn hệ thống.
/// Quán ít đánh giá bị "kéo" về C để quán 1 đánh giá 5★ không vượt quán 200 đánh giá 4,8★.
function bayesianAverage(average, count, globalMean = DEFAULT_GLOBAL_MEAN, m = PRIOR_WEIGHT) {
  if (!count) return globalMean;
  return (count / (count + m)) * average + (m / (count + m)) * globalMean;
}

const round1 = (n) => Math.round(n * 10) / 10;
const round2 = (n) => Math.round(n * 100) / 100;
const percent = (part, total) => (total ? Math.round((part * 100) / total) : 0);

function summarizeReviews(reviews, { globalMean = DEFAULT_GLOBAL_MEAN } = {}) {
  const count = reviews.length;
  const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  const sentiment = { positive: 0, neutral: 0, negative: 0 };
  const aspectAgg = {};
  const keywordCounts = new Map();
  let sum = 0;

  for (const r of reviews) {
    distribution[r.rating] += 1;
    sum += r.rating;
    sentiment[(r.sentiment && r.sentiment.label) || labelFromRating(r.rating)] += 1;
    for (const [aspect, score] of Object.entries(r.aspects || {})) {
      if (typeof score !== 'number') continue;
      const a = aspectAgg[aspect] || (aspectAgg[aspect] = { positive: 0, neutral: 0, negative: 0, count: 0 });
      a[labelFor(score)] += 1;
      a.count += 1;
    }
    for (const k of r.keywords || []) {
      const key = `${k.polarity}|${k.term}`;
      keywordCounts.set(key, (keywordCounts.get(key) || 0) + 1);
    }
  }

  const average = count ? sum / count : 0;
  return {
    count,
    average: round1(average),
    bayesian: round2(bayesianAverage(average, count, globalMean)),
    distribution,
    sentiment: Object.fromEntries(Object.entries(sentiment).map(([k, v]) => [k, { count: v, percent: percent(v, count) }])),
    aspects: Object.entries(aspectAgg)
      .map(([key, a]) => ({
        key,
        label: ASPECT_LABELS[key] || key,
        count: a.count,
        positivePercent: percent(a.positive, a.count),
        neutralPercent: percent(a.neutral, a.count),
        negativePercent: percent(a.negative, a.count),
      }))
      .sort((x, y) => y.count - x.count),
    keywords: [...keywordCounts.entries()]
      .map(([key, n]) => {
        const [polarity, term] = key.split('|');
        return { term, polarity, count: n };
      })
      .sort((x, y) => y.count - x.count || x.term.localeCompare(y.term))
      .slice(0, 8),
  };
}

module.exports = { summarizeReviews, bayesianAverage, PRIOR_WEIGHT, DEFAULT_GLOBAL_MEAN };
