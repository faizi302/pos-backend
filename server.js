import "./config/env.js";

import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import compression from "compression";
import cookieParser from "cookie-parser";
import rateLimit from "express-rate-limit";

import connectDB from "./config/db.js";
import logger from "./config/logger.js";
import errorHandler from "./middlewares/error.middleware.js";

import userRoutes from "./routes/authRoutes.js";
import permissionRoutes from "./routes/permissionRoutes.js";
import roleRoutes from "./routes/roleRoutes.js";
import businessRoutes from "./routes/businessRoutes.js";
import businessTypeRoutes from "./routes/businessTypeRoutes.js";
import brandRoutes from "./routes/brandRoutes.js";
import modelRoutes from "./routes/modelRoutes.js";
import productRoutes from "./routes/productRoutes.js";
import productInventRoutes from "./routes/productInventory.js";
import categroyRoutes from "./routes/categoryRoutes.js";
import supplierRoutes from "./routes/supplierRoutes.js";
import customerRoutes from "./routes/customerRoutes.js";
import purchaseRoutes from "./routes/purchaseRoutes.js";
import purchaseItemsRoutes from "./routes/purchaseItemsRoutes.js";
import stockMovementRoutes from "./routes/stockMovementRoutes.js";
import saleRoutes from "./routes/saleRoutes.js";
import saleItemRoutes from "./routes/saleItemRoutes.js";
import salePaymentRoutes from "./routes/salePaymentRoutes.js"
import saleReturnRoutes from "./routes/saleReturnRoutes.js";
import saleReturnItemRoutes from "./routes/saleReturnItemRoutes.js";
import expenseCategoryRoutes from "./routes/expenseCategoryRoutes.js";
import expenseRoutes from "./routes/expenseRoutes.js";
import cashRegisterRoutes from "./routes/cashRegisterRoutes.js";
import reportRoutes from "./routes/reportRoutes.js";

import paymentRoutes from "./routes/paymentRoutes.js";
import paypalwebhookRoutes from "./webhooksRoutes/paypalWebhookRoutes.js";


// ======================================================
// Express App
// ======================================================

const app = express();

// ======================================================
// Security & Performance
// ======================================================

app.use(helmet());

app.use(compression());

// ======================================================
// Rate Limiting
// ======================================================

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,

  standardHeaders: true,
  legacyHeaders: false,

  message: {
    success: false,
    message: "Too many requests, please try again later.",
  },
});

app.use(limiter);

// ======================================================
// CORS
// ======================================================

const allowedOrigins = [
  "http://localhost:3000",
  "http://localhost:5173",
  "http://localhost:5174",

  // Production frontend later:
  // "https://your-pos-frontend.com",
];

app.use(
  cors({
    origin: function (origin, callback) {
      // Allow requests without Origin
      // Example: Postman, mobile apps, server-to-server
      if (!origin) {
        return callback(null, true);
      }

      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      return callback(new Error("Not allowed by CORS"));
    },

    methods: [
      "GET",
      "POST",
      "PATCH",
      "PUT",
      "DELETE",
      "OPTIONS",
    ],

    allowedHeaders: [
      "Content-Type",
      "Authorization",
    ],

    credentials: true,
  })
);

// ======================================================
// webhooks
// ======================================================
app.use(
  "/api/payments", paypalwebhookRoutes
);


// ======================================================
// Body Parsing & Cookies
// ======================================================

app.use(
  express.json({
    limit: "10mb",
  })
);

app.use(
  express.urlencoded({
    extended: true,
  })
);

app.use(cookieParser());

// ======================================================
// HTTP Request Logging
// ======================================================

app.use(
  morgan(
    process.env.NODE_ENV === "production"
      ? "combined"
      : "dev"
  )
);

// ======================================================
// Health Check
// ======================================================

app.get("/", (req, res) => {
  res.status(200).json({
    success: true,
    message: "POS Backend is running 🚀",
    environment: process.env.NODE_ENV || "development",
  });
});

// ======================================================
// API Routes
// ======================================================

app.use("/api/users", userRoutes);

app.use("/api/permissions", permissionRoutes);

app.use("/api/roles", roleRoutes);

app.use("/api/business",businessRoutes);
app.use("/api/business-type",businessTypeRoutes);
app.use("/api/brand",brandRoutes);
app.use("/api/model",modelRoutes);
app.use("/api/products" , productRoutes);
app.use("/api/products-Inventory", productInventRoutes);
app.use("/api/Prod-cat", categroyRoutes);
app.use("/api/supplier", supplierRoutes);
app.use("/api/customers", customerRoutes);
app.use("/api/purchase", purchaseRoutes);
app.use("/api/purchase-items", purchaseItemsRoutes);
app.use("/api/stock-mov", stockMovementRoutes);
app.use("/api/sale", saleRoutes);
app.use("/api/sale-item", saleItemRoutes);
app.use("/api/sale-payment", salePaymentRoutes);
app.use("/api/sale-return", saleReturnRoutes);
app.use("/api/sale-return-item", saleReturnItemRoutes);
app.use("/api/expense-cat", expenseCategoryRoutes);
app.use("/api/expense", expenseRoutes);
app.use("/api/cash-register", cashRegisterRoutes);
app.use("/api/reports", reportRoutes);
app.use("/api/payment" , paymentRoutes)

// ======================================================
// 404 - Route Not Found
// ======================================================

app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Route not found: ${req.method} ${req.originalUrl}`,
  });
});

// ======================================================
// Global Error Handler
// ======================================================

// IMPORTANT:
// This must be the LAST middleware.

app.use(errorHandler);

// ======================================================
// Start Server
// ======================================================

const PORT = process.env.PORT || 5500;

const startServer = async () => {
  try {
    // Connect MongoDB first
    await connectDB();

    // Start Express server
    const server = app.listen(PORT, () => {
      logger.info("POS Backend server started successfully");
      logger.info(`Server running on port ${PORT}`);
      logger.info(
        `Environment: ${process.env.NODE_ENV || "development"}`
      );
    });

    // ======================================================
    // Graceful Shutdown
    // ======================================================

    const shutdown = (signal) => {
      logger.info(
        `${signal} received. Shutting down server...`
      );

      server.close(() => {
        logger.info("HTTP server closed");

        process.exit(0);
      });
    };

    process.on("SIGTERM", () => {
      shutdown("SIGTERM");
    });

    process.on("SIGINT", () => {
      shutdown("SIGINT");
    });
  } catch (error) {
    logger.error("Failed to start server:", error);

    process.exit(1);
  }
};

startServer();