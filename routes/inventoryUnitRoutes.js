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
  authorize("units.create"),
  createInventoryUnit
);

// =====================================================
// GET ALL INVENTORY UNITS
// GET /
// =====================================================
router.get(
  "/",
  protect,
  authorize("units.read"),
  getAllInventoryUnits
);

// =====================================================
// GET UNITS BY PRODUCT INVENTORY
// GET /product-inventory/:productInventoryId
// =====================================================
router.get(
  "/product-inventory/:productInventoryId",
  protect,
  authorize("units.read"),
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
  authorize("units.read"),
  getInventoryUnitByImei
);

// =====================================================
// GET INVENTORY UNIT BY ID
// GET /:id
// =====================================================
router.get(
  "/:id",
  protect,
  authorize("units.read"),
  getInventoryUnitById
);

// =====================================================
// UPDATE INVENTORY UNIT
// PATCH /:id
// =====================================================
router.patch(
  "/:id",
  protect,
  authorize("units.update"),
  updateInventoryUnit
);

// =====================================================
// DELETE INVENTORY UNIT (soft)
// DELETE /:id
// =====================================================
router.delete(
  "/:id",
  protect,
  authorize("units.delete"),
  deleteInventoryUnit
);

// =====================================================
// RESTORE INVENTORY UNIT
// PATCH /:id/restore
// =====================================================
router.patch(
  "/:id/restore",
  protect,
  authorize("units.update"),
  restoreInventoryUnit
);

export default router;