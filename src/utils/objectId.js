// ObjectId hợp lệ của MongoDB luôn là chuỗi hex đúng 24 ký tự. Dùng regex chặt (thay vì
// mongoose.isValidObjectId vốn chấp nhận cả số/chuỗi 12 ký tự) để từ chối sớm các id
// không phải của MongoDB — ví dụ id "1".."8" của dữ liệu minh hoạ đóng gói sẵn trong app.
function isObjectIdString(value) {
  return typeof value === 'string' && /^[a-f0-9]{24}$/i.test(value);
}

module.exports = { isObjectIdString };
