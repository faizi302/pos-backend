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
} from "../controllers/productInventoryController.js";

import { protect } from "../middlewares/auth.middleware.js";
import { authorize } from "../middlewares/permission.middleware.js";

const router = express.Router();

router.post(
  "/",
  protect,
  authorize("inventory.adjust"),
  createProductInventory
);

router.get(
  "/",
  protect,
  authorize("inventory.read"),
  getAllProductInventory
);

router.get(
  "/product/:productId",
  protect,
  authorize("inventory.read"),
  getProductInventory
);

router.get(
  "/:id",
  protect,
  authorize("inventory.read"),
  getProductInventoryById
);

router.patch(
  "/:id",
  protect,
  authorize("inventory.adjust"),
  updateProductInventory
);

router.patch(
  "/:id/stock",
  protect,
  authorize("inventory.adjust"),
  updateProductStock
);

router.delete(
  "/:id",
  protect,
  authorize("inventory.adjust"),
  deleteProductInventory
);

router.patch(
  "/:id/restore",
  protect,
  authorize("inventory.adjust"),
  restoreProductInventory
);

export default router;