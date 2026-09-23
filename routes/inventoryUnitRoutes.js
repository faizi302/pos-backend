import express from "express";

import {
  createInventoryUnit,
  getAllInventoryUnits,
  getInventoryUnitsByProductInventory,
  getInventoryUnitById,
  getInventoryUnitByImei,
  updateInventoryUnit,
  deleteInventoryUnit,
  restoreInventoryUnit,
} from "../controllers/inventoryUnitController.js";

import { protect } from "../middlewares/auth.middleware.js";
import { authorize } from "../middlewares/permission.middleware.js";

const router = express.Router();

// =====================================================
// CREATE INVENTORY UNIT
// POST /
// =====================================================
router.post(
  "/",
  protect,
  authorize("inventory.adjust"),
  createInventoryUnit
);

// =====================================================
// GET ALL INVENTORY UNITS
// GET /
// =====================================================
router.get(
  "/",
  protect,
  authorize("inventory.read"),
  getAllInventoryUnits
);

// =====================================================
// GET UNITS BY PRODUCT INVENTORY
// GET /product-inventory/:productInventoryId
// =====================================================
router.get(
  "/product-inventory/:productInventoryId",
  protect,
  authorize("inventory.read"),
  getInventoryUnitsByProductInventory
);

// =====================================================
// SCAN / GET BY IMEI
// GET /imei/:imei
// Must be before /:id
// =====================================================
router.get(
  "/imei/:imei",
  protect,
  authorize("inventory.read"),
  getInventoryUnitByImei
);

// =====================================================
// GET INVENTORY UNIT BY ID
// GET /:id
// =====================================================
router.get(
  "/:id",
  protect,
  authorize("inventory.read"),
  getInventoryUnitById
);

// =====================================================
// UPDATE INVENTORY UNIT
// PATCH /:id
// =====================================================
router.patch(
  "/:id",
  protect,
  authorize("inventory.adjust"),
  updateInventoryUnit
);

// =====================================================
// DELETE INVENTORY UNIT (soft)
// DELETE /:id
// =====================================================
router.delete(
  "/:id",
  protect,
  authorize("inventory.adjust"),
  deleteInventoryUnit
);

// =====================================================
// RESTORE INVENTORY UNIT
// PATCH /:id/restore
// =====================================================
router.patch(
  "/:id/restore",
  protect,
  authorize("inventory.adjust"),
  restoreInventoryUnit
);

export default router;