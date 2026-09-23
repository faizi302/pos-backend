import express from "express";

import {
  createProduct,
  getAllProducts,
  getProductById,
  updateProduct,
  deleteProduct,
} from "../controllers/productController.js";

import { protect } from "../middlewares/auth.middleware.js";
import { authorize } from "../middlewares/permission.middleware.js";
import validate from "../middlewares/validate.js";
import upload from "../middlewares/upload.middleware.js";

import {
  createProductSchema,
  updateProductSchema,
} from "../validations/product.validation.js";

const router = express.Router();

// =====================================================
// CREATE PRODUCT
// POST /
// FormData: images (max 10)
// =====================================================
router.post(
  "/",
  protect,
  authorize("products.create"),
  upload.array("images", 10),
  validate(createProductSchema),
  createProduct
);

// =====================================================
// GET ALL PRODUCTS
// GET /
// =====================================================
router.get(
  "/",
  protect,
  authorize("products.read"),
  getAllProducts
);

// =====================================================
// GET PRODUCT BY ID
// GET /:id
// =====================================================
router.get(
  "/:id",
  protect,
  authorize("products.read"),
  getProductById
);

// =====================================================
// UPDATE PRODUCT
// PATCH /:id
// FormData: images (max 10), removeImages (optional)
// =====================================================
router.patch(
  "/:id",
  protect,
  authorize("products.update"),
  upload.array("images", 10),
  validate(updateProductSchema),
  updateProduct
);

// =====================================================
// DELETE PRODUCT (permanent)
// DELETE /:id
// =====================================================
router.delete(
  "/:id",
  protect,
  authorize("products.delete"),
  deleteProduct
);

export default router;