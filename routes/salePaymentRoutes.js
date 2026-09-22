import express from "express";

import {
  createSalePayment,
  getAllSalePayments,
  getSalePaymentsBySale,
  getSalePaymentById,
  updateSalePayment,
  cancelSalePayment,
  deleteSalePayment,
} from "../controllers/salePaymentController.js";

import { protect } from "../middlewares/auth.middleware.js";
import { authorize } from "../middlewares/permission.middleware.js";
import validate from "../middlewares/validate.js";

import {
  createSalePaymentSchema,
  updateSalePaymentSchema,
} from "../validations/salePayment.validation.js";

const router = express.Router();

// Create payment
router.post(
  "/",
  protect,
  authorize("sale-payments.create"),
  validate(createSalePaymentSchema),
  createSalePayment
);

// Get all payments
router.get(
  "/",
  protect,
  authorize("sale-payments.read"),
  getAllSalePayments
);

// Get payments of a specific sale
router.get(
  "/sale/:saleId",
  protect,
  authorize("sale-payments.read"),
  getSalePaymentsBySale
);

// Get payment by ID
router.get(
  "/:id",
  protect,
  authorize("sale-payments.read"),
  getSalePaymentById
);

// Update payment
router.patch(
  "/:id",
  protect,
  authorize("sale-payments.update"),
  validate(updateSalePaymentSchema),
  updateSalePayment
);

// Cancel payment
router.patch(
  "/:id/cancel",
  protect,
  authorize("sale-payments.update"),
  cancelSalePayment
);

// Permanent delete is intentionally blocked
router.delete(
  "/:id",
  protect,
  authorize("sale-payments.delete"),
  deleteSalePayment
);

export default router;