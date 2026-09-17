import express from "express";

import {
  createSaleItem,
  getAllSaleItems,
  getSaleItemsBySale,
  getSaleItemById,
  updateSaleItem,
  deleteSaleItem,
} from "../controllers/saleItemController.js";

import { protect } from "../middlewares/auth.middleware.js";
import { authorize } from "../middlewares/permission.middleware.js";
import validate from "../middlewares/validate.js";

import {
  createSaleItemSchema,
  updateSaleItemSchema,
} from "../validations/saleItem.validation.js";

const router = express.Router();

/*
 * Create Sale Item
 */
router.post(
  "/",
  protect,
  authorize("sale-items.create"),
  validate(createSaleItemSchema),
  createSaleItem
);

/*
 * Get all Sale Items
 */
router.get(
  "/",
  protect,
  authorize("sale-items.read"),
  getAllSaleItems
);

/*
 * Get Sale Items by Sale
 *
 * Keep this BEFORE /:id
 */
router.get(
  "/sale/:saleId",
  protect,
  authorize("sale-items.read"),
  getSaleItemsBySale
);

/*
 * Get Sale Item by ID
 */
router.get(
  "/:id",
  protect,
  authorize("sale-items.read"),
  getSaleItemById
);

/*
 * Update Sale Item
 */
router.patch(
  "/:id",
  protect,
  authorize("sale-items.update"),
  validate(updateSaleItemSchema),
  updateSaleItem
);

/*
 * Delete Sale Item
 */
router.delete(
  "/:id",
  protect,
  authorize("sale-items.delete"),
  deleteSaleItem
);

export default router;