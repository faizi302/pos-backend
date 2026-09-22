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

// ======================================================
// CREATE PRODUCT
// POST /
// - images: multipart field "images" (max 10)
// - validate runs AFTER upload so FormData body fields exist
// ======================================================

router.post(
  "/",
  protect,
  authorize("products.create"),
  upload.array("images", 10),
  validate(createProductSchema),
  createProduct
);

// ======================================================
// GET ALL PRODUCTS
// GET /?page&limit&search&category&brand&model&productType&isActive&trackSerial&stockStatus
// ======================================================

router.get("/", protect, authorize("products.read"), getAllProducts);

// ======================================================
// GET PRODUCT BY ID
// GET /:id
// ======================================================

router.get("/:id", protect, authorize("products.read"), getProductById);

// ======================================================
// UPDATE PRODUCT
// PATCH /:id
// - images: multipart field "images" (max 10)
// - removeImages: optional (string | JSON array of publicIds)
// ======================================================

router.patch(
  "/:id",
  protect,
  authorize("products.update"),
  upload.array("images", 10),
  validate(updateProductSchema),
  updateProduct
);

// ======================================================
// DELETE PRODUCT (soft — isActive: false)
// DELETE /:id
// ======================================================

router.delete(
  "/:id",
  protect,
  authorize("products.delete"),
  deleteProduct
);

// ======================================================
// RESTORE PRODUCT
// PATCH /:id/restore
// ======================================================


export default router;