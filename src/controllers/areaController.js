const asyncHandler = require('../utils/asyncHandler');
const geo = require('../services/geo');

/// GET /api/areas — danh sách tỉnh/thành (+ quận/huyện) đang có dữ liệu, cho UI
/// "chọn khu vực để tải" (thay vì chỉ tải theo bán kính quanh vị trí hiện tại).
const listAreas = asyncHandler(async (req, res) => {
  const areas = await geo.listAreas();
  res.json({ areas });
});

module.exports = { listAreas };
