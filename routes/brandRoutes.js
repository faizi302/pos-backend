import express from "express";

import {
  createBrand,
  getAllBrands,
  getBrandsByBusinessType,
  getBrandById,
  updateBrand,
  deleteBrand,
} from "../controllers/brandController.js";

import validate from "../middlewares/validate.js";

import {
  createBrandSchema,
  updateBrandSchema,
} from "../validations/brand.validation.js";

import { protect } from "../middlewares/auth.middleware.js";
import { authorize } from "../middlewares/permission.middleware.js";

const router = express.Router();

// =====================================================
// BRAND CRUD
// =====================================================

// Create Brand
router.post(
  "/",
  protect,
  authorize("brands.create"),
  validate(createBrandSchema),
  createBrand
);

// Get All Brands
router.get(
  "/",
  protect,
  authorize("brands.read"),
  getAllBrands
);

// Get Brands By Business Type
router.get(
  "/business-type/:businessTypeId",
  protect,
  authorize("brands.read"),
  getBrandsByBusinessType
);

// Get Brand By ID
router.get(
  "/:id",
  protect,
  authorize("brands.read"),
  getBrandById
);

// Update Brand
router.put(
  "/:id",
  protect,
  authorize("brands.update"),
  validate(updateBrandSchema),
  updateBrand
);

// Delete Brand
router.delete(
  "/:id",
  protect,
  authorize("brands.delete"),
  deleteBrand
);

export default router;