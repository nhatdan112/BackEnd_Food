const express = require('express');
const rateLimit = require('express-rate-limit');
const { listReviews, submitReview, deleteMyReview } = require('../controllers/reviewController');
const { uploadPhoto, reportPhoto, getPlaceAddress } = require('../controllers/placeExtrasController');
const { getPlace, getNearby, getByArea, downloadData, importNearbyPlaces } = require('../controllers/placeController');
const { requireAuth, optionalAuth } = require('../middleware/auth');

const router = express.Router();

// Giới hạn tần suất: đánh giá/ảnh chống spam; nhập dữ liệu từ máy chủ OSM công cộng thì giới hạn chặt để lịch sự với Overpass/Nominatim.
const reviewLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 30, standardHeaders: true, legacyHeaders: false });
const photoLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 20, standardHeaders: true, legacyHeaders: false });
const addressLimiter = rateLimit({ windowMs: 10 * 60 * 1000, max: 60, standardHeaders: true, legacyHeaders: false });
const importLimiter = rateLimit({ windowMs: 10 * 60 * 1000, max: 8, standardHeaders: true, legacyHeaders: false });

router.get('/nearby', getNearby);
router.get('/by-area', getByArea);
// Đánh giá & bình luận, ảnh quán, địa chỉ cụ thể (các route có hậu tố đặt TRƯỚC '/:id').
router.get('/:id/reviews', optionalAuth, listReviews);
router.post('/:id/reviews', requireAuth, reviewLimiter, submitReview);
router.delete('/:id/reviews/me', requireAuth, deleteMyReview);
router.post('/:id/photos', requireAuth, photoLimiter, uploadPhoto);
router.post('/:id/photos/report', requireAuth, reviewLimiter, reportPhoto);
router.get('/:id/address', requireAuth, addressLimiter, getPlaceAddress);
router.get('/:id', getPlace);
// Tải hàng loạt để dùng offline — yêu cầu đăng nhập (đã đăng nhập 1 lần thì token vẫn dùng được).
router.post('/download', requireAuth, downloadData);
// Lấy quán ăn thật quanh vị trí người dùng (OpenStreetMap) — chỉ khi người dùng chủ động bấm.
router.post('/import-nearby', requireAuth, importLimiter, importNearbyPlaces);

module.exports = router;
