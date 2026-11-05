// Bọc một async route handler để tự động chuyển lỗi (reject) sang next(err) —
// tránh phải try/catch lặp lại trong từng controller.
function asyncHandler(fn) {
  return function wrapped(req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

module.exports = asyncHandler;
