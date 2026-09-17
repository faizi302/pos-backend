import express from "express";

import {
  createProduct,
  getAllProducts,
  getProductById,
  updateProduct,
  deleteProduct,
  restoreProduct,
} from "../controllers/productController.js";

import { protect } from "../middlewares/auth.middleware.js";
import { authorize } from "../middlewares/permission.middleware.js";

import upload from "../middlewares/upload.middleware.js";

const router = express.Router();

// ======================================================
// CREATE PRODUCT
// ======================================================
//
// Permissions:
// - Super Admin
// - Admin
// - Manager
//
// Business / BusinessType:
// - Super Admin can select them
// - Admin/Manager get them from authenticated user
//
// Images:
// - Maximum 10 images
//
// ======================================================

router.post(
  "/",
  protect,
  authorize("products.create"),
  upload.array("images", 10),
  createProduct
);

// ======================================================
// GET ALL PRODUCTS
// ======================================================
//
// Supports:
// - pagination
// - search
// - category
// - brand
// - model
// - productType
// - isActive
// - stockStatus
// - business
// - businessType
//
// Tenant isolation is handled inside controller.
//
// ======================================================

router.get(
  "/",
  protect,
  authorize("products.read"),
  getAllProducts
);

// ======================================================
// GET PRODUCT BY ID
// ======================================================
//
// Tenant isolation is handled inside controller.
//
// Super Admin:
// - Can optionally use business/businessType query
//
// Admin / Manager:
// - Automatically restricted to their business/businessType
//
// ======================================================

router.get(
  "/:id",
  protect,
  authorize("products.read"),
  getProductById
);

// ======================================================
// UPDATE PRODUCT
// ======================================================
//
// Supports:
// - normal product fields
// - brand/model/category changes
// - price changes
// - boolean fields
// - remove old images
// - upload new images
//
// Images:
// - Maximum 10 images per request
//
// Tenant isolation is handled inside controller.
//
// ======================================================

router.patch(
  "/:id",
  protect,
  authorize("products.update"),
  upload.array("images", 10),
  updateProduct
);

// ======================================================
// DELETE PRODUCT
// ======================================================
//
// Soft delete.
//
// Product:
//   isActive = false
//
// Inventory:
//   isActive = false
//
// ======================================================

router.delete(
  "/:id",
  protect,
  authorize("products.delete"),
  deleteProduct
);

// ======================================================
// RESTORE PRODUCT
// ======================================================
//
// Restores:
// - Product
// - Product inventory
//
// Uses products.update permission because restore
// is an update operation.
//
// ======================================================

router.patch(
  "/:id/restore",
  protect,
  authorize("products.update"),
  restoreProduct
);

export default router;