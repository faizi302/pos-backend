// =====================================================
// SUCCESS RESPONSE
// =====================================================

export const successResponse = (
  res,
  statusCode = 200,
  message = "Success",
  data = null
) => {
  return res.status(statusCode).json({
    success: true,
    message,
    data,
  });
};

// =====================================================
// ERROR RESPONSE
// =====================================================

export const errorResponse = (
  res,
  statusCode = 500,
  message = "Something went wrong",
  errors = null
) => {
  return res.status(statusCode).json({
    success: false,
    message,
    ...(errors && { errors }),
  });
};