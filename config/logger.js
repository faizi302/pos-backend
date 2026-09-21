import winston from "winston";

// ======================================================
// LOG FORMAT
// ======================================================

const logFormat = winston.format.combine(
  winston.format.timestamp({
    format: "YYYY-MM-DD HH:mm:ss",
  }),
  winston.format.errors({
    stack: true,
  }),
  winston.format.splat(),
  winston.format.json()
);

// ======================================================
// CONSOLE FORMAT
// ======================================================

const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({
    format: "YYYY-MM-DD HH:mm:ss",
  }),
  winston.format.printf(({ timestamp, level, message, stack }) => {
    return stack
      ? `${timestamp} [${level}]: ${message}\n${stack}`
      : `${timestamp} [${level}]: ${message}`;
  })
);

// ======================================================
// LOGGER
// ======================================================

const isProduction = process.env.NODE_ENV === "production";

const logger = winston.createLogger({
  level: isProduction ? "info" : "debug",

  format: logFormat,

  defaultMeta: {
    service: "pos-backend",
  },

  transports: [
    // ==================================================
    // CONSOLE LOGGING
    // ==================================================
    // Vercel collects console logs automatically.
    // This is the correct approach for production.
    // ==================================================

    new winston.transports.Console({
      format: isProduction ? logFormat : consoleFormat,
    }),
  ],
});

// ======================================================
// EXPORT
// ======================================================

export default logger;