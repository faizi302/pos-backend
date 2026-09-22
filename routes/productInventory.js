import express from "express";

import {
  createProductInventory,
  getAllProductInventory,
  getProductInventory,
  getProductInventoryById,
  updateProductInventory,
  updateProductStock,
  deleteProductInventory,
  restoreProductInventory,
  scanProductInventory,          // ← NEW
} from "../controllers/productInventoryController.js";

import { protect } from "../middlewares/auth.middleware.js";
import { authorize } from "../middlewares/permission.middleware.js";

const router = express.Router();

// =====================================================
// CREATE
// =====================================================
router.post(
  "/",
  protect,
  authorize("inventory.adjust"),
  createProductInventory
);

// =====================================================
// SCAN / LOOKUP BY IMEI OR UNIT BARCODE  (NEW)
// Must be placed BEFORE /:id routes
// =====================================================
router.get(
  "/scan",
  protect,
  authorize("inventory.read"),
  scanProductInventory
);

// =====================================================
// GET ALL
// =====================================================
router.get(
  "/",
  protect,
  authorize("inventory.read"),
  getAllProductInventory
);

// =====================================================
// GET BY PRODUCT
// =====================================================
router.get(
  "/product/:productId",
  protect,
  authorize("inventory.read"),
  getProductInventory
);

// =====================================================
// GET BY ID
// =====================================================
router.get(
  "/:id",
  protect,
  authorize("inventory.read"),
  getProductInventoryById
);

// =====================================================
// UPDATE
// =====================================================
router.patch(
  "/:id",
  protect,
  authorize("inventory.adjust"),
  updateProductInventory
);

// =====================================================
// UPDATE STOCK
// =====================================================
router.patch(
  "/:id/stock",
  protect,
  authorize("inventory.adjust"),
  updateProductStock
);

// =====================================================
// DELETE (soft)
// =====================================================
router.delete(
  "/:id",
  protect,
  authorize("inventory.adjust"),
  deleteProductInventory
);

// =====================================================
// RESTORE
// =====================================================
router.patch(
  "/:id/restore",
  protect,
  authorize("inventory.adjust"),
  restoreProductInventory
);

export default router;