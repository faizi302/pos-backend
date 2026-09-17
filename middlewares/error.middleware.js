import logger from "../config/logger.js";

const errorHandler = (err, req, res, next) => {
  // Default values
  let statusCode = err.statusCode || 500;
  let message = err.message || "Internal Server Error";

  // ==============================
  // Mongoose Errors
  // ==============================

  // Invalid MongoDB ObjectId
  if (err.name === "CastError") {
    statusCode = 400;
    message = "Invalid ID format";
  }

  // Mongoose validation error
  if (err.name === "ValidationError") {
    statusCode = 400;

    message = Object.values(err.errors)
      .map((error) => error.message)
      .join(", ");
  }

  // Duplicate MongoDB field
  if (err.code === 11000) {
    statusCode = 400;

    const field = Object.keys(err.keyValue || {})[0];

    message = field
      ? `${field} already exists`
      : "Duplicate value already exists";
  }

  // ==============================
  // JWT Errors
  // ==============================

  if (err.name === "JsonWebTokenError") {
    statusCode = 401;
    message = "Invalid token";
  }

  if (err.name === "TokenExpiredError") {
    statusCode = 401;
    message = "Token has expired";
  }

  // ==============================
  // Winston Logging
  // ==============================

  logger.error(message, {
    stack: err.stack,
    method: req.method,
    url: req.originalUrl,
    statusCode,
  });

  // ==============================
  // API Response
  // ==============================

  res.status(statusCode).json({
    success: false,
    message,

    ...(process.env.NODE_ENV === "development" && {
      stack: err.stack,
    }),
  });
};

export default errorHandler;