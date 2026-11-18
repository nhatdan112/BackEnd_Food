const fs = require('fs');
const path = require('path');

/// Thao tác của người duyệt ảnh (dùng bởi scripts/moderatePhotos.js) — tách riêng để kiểm thử được.
const isSafeUploadUrl = (url) => typeof url === 'string' && url.startsWith('/uploads/places/') && !url.includes('..');

async function approvePhoto(photo, place) {
  photo.status = 'approved';
  photo.moderation = { ...(photo.moderation && photo.moderation.toObject ? photo.moderation.toObject() : photo.moderation), method: 'manual', verdict: 'approved' };
  await photo.save();
  if (place) {
    const list = (place.imageUrls || []).filter(Boolean);
    if (!list.includes(photo.url)) place.imageUrls = [...list, photo.url];
    await place.save();
  }
}

/// Từ chối/gỡ ảnh: đổi trạng thái, gỡ khỏi quán và XOÁ FILE trên đĩa.
async function rejectPhoto(photo, place, uploadsDir) {
  photo.status = 'rejected';
  photo.moderation = { ...(photo.moderation && photo.moderation.toObject ? photo.moderation.toObject() : photo.moderation), method: 'manual', verdict: 'rejected' };
  await photo.save();
  if (place) {
    place.imageUrls = (place.imageUrls || []).filter((u) => u !== photo.url);
    await place.save();
  }
  if (isSafeUploadUrl(photo.url)) fs.rmSync(path.join(uploadsDir, photo.url.replace('/uploads/', '')), { force: true });
}

module.exports = { approvePhoto, rejectPhoto, isSafeUploadUrl };
