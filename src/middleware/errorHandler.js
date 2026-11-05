const ApiError = require('../utils/ApiError');

function notFound(req, res, next) {
  next(ApiError.notFound(`Không tìm thấy đường dẫn: ${req.method} ${req.originalUrl}`));
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  if (err.name === 'CastError') {
    // Id/giá trị sai kiểu (ví dụ id không phải ObjectId) — lỗi của client, không phải lỗi máy chủ.
    return res.status(400).json({ error: { message: `Giá trị không hợp lệ cho "${err.path}".` } });
  }
  if (err.name === 'ValidationError') {
    // Lỗi validate của Mongoose
    return res.status(400).json({ error: { message: 'Dữ liệu không hợp lệ.', details: err.errors } });
  }
  if (err.code === 11000) {
    // Lỗi trùng khoá duy nhất (ví dụ email đã tồn tại)
    return res.status(409).json({ error: { message: 'Dữ liệu đã tồn tại.', details: err.keyValue } });
  }

  const statusCode = err instanceof ApiError ? err.statusCode : (err.statusCode || 500);
  const message = statusCode === 500 && process.env.NODE_ENV === 'production'
    ? 'Đã có lỗi xảy ra ở máy chủ.'
    : err.message;

  if (statusCode === 500) {
    console.error(err);
  }

  res.status(statusCode).json({
    error: {
      message,
      ...(err.details ? { details: err.details } : {}),
    },
  });
}

module.exports = { notFound, errorHandler };
