const express = require('express');
const rateLimit = require('express-rate-limit');
const { getPlace, getNearby, getByArea, downloadData, importNearbyPlaces } = require('../controllers/placeController');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// Nhập dữ liệu từ máy chủ OSM công cộng → giới hạn chặt để lịch sự với Overpass/Nominatim.
const importLimiter = rateLimit({ windowMs: 10 * 60 * 1000, max: 8, standardHeaders: true, legacyHeaders: false });

router.get('/nearby', getNearby);
router.get('/by-area', getByArea);
router.get('/:id', getPlace);
// Tải hàng loạt để dùng offline — yêu cầu đăng nhập (đã đăng nhập 1 lần thì token vẫn dùng được).
router.post('/download', requireAuth, downloadData);
// Lấy quán ăn thật quanh vị trí người dùng (OpenStreetMap) — chỉ khi người dùng chủ động bấm.
router.post('/import-nearby', requireAuth, importLimiter, importNearbyPlaces);

module.exports = router;
