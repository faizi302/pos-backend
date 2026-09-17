import express from "express";

import {
  createPurchase,
  getAllPurchases,
  getPurchaseById,
  updatePurchase,
  deletePurchase,
  restorePurchase,
} from "../controllers/purchaseController.js";

import { protect } from "../middlewares/auth.middleware.js";
import { authorize } from "../middlewares/permission.middleware.js";

import validate from "../middlewares/validate.js";

import {
  createPurchaseSchema,
  updatePurchaseSchema,
} from "../validations/purchase.validation.js";

const router = express.Router();

/*
 * Create purchase
 */
router.post(
  "/",
  protect,
  authorize("purchases.create"),
  validate(createPurchaseSchema),
  createPurchase
);

/*
 * Get all purchases
 */
router.get(
  "/",
  protect,
  authorize("purchases.read"),
  getAllPurchases
);

/*
 * Get single purchase
 *
 * Keep this BEFORE any future special
 * dynamic routes if you add them.
 */
router.get(
  "/:id",
  protect,
  authorize("purchases.read"),
  getPurchaseById
);

/*
 * Update purchase
 */
router.patch(
  "/:id",
  protect,
  authorize("purchases.update"),
  validate(updatePurchaseSchema),
  updatePurchase
);

/*
 * Cancel purchase
 */
router.delete(
  "/:id",
  protect,
  authorize("purchases.delete"),
  deletePurchase
);

/*
 * Restore cancelled purchase
 */
router.patch(
  "/:id/restore",
  protect,
  authorize("purchases.update"),
  restorePurchase
);

export default router;