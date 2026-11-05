/// Lỗi nghiệp vụ có mã HTTP đi kèm — ném ra ở bất kỳ đâu, errorHandler sẽ bắt và trả về đúng định dạng.
class ApiError extends Error {
  constructor(statusCode, message, details) {
    super(message);
    this.statusCode = statusCode;
    this.details = details;
  }

  static badRequest(message, details) {
    return new ApiError(400, message, details);
  }
  static unauthorized(message = 'Chưa xác thực hoặc token không hợp lệ.') {
    return new ApiError(401, message);
  }
  static forbidden(message = 'Không có quyền truy cập.') {
    return new ApiError(403, message);
  }
  static notFound(message = 'Không tìm thấy dữ liệu.') {
    return new ApiError(404, message);
  }
  static conflict(message) {
    return new ApiError(409, message);
  }
  static internal(message = 'Đã có lỗi xảy ra ở máy chủ.') {
    return new ApiError(500, message);
  }
  static badGateway(message = 'Nguồn dữ liệu bên ngoài không phản hồi.') {
    return new ApiError(502, message);
  }
}

module.exports = ApiError;
