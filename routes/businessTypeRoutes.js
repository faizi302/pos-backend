import express from "express";

import {
  createBusinessType,
  getPublicBusinessTypesByBusiness,
  getAllBusinessTypes,
  getBusinessTypesByBusiness,
  getBusinessTypeById,
  updateBusinessType,
  deleteBusinessType,
} from "../controllers/businessTypeController.js";

import validate from "../middlewares/validate.js";

import {
  createBusinessTypeSchema,
  updateBusinessTypeSchema,
} from "../validations/businessType.validation.js";

import { protect } from "../middlewares/auth.middleware.js";
import { authorize } from "../middlewares/permission.middleware.js";

const router = express.Router();

// =====================================================
// CREATE BUSINESS TYPE
// =====================================================

router.post(
  "/",
  protect,
  authorize("businesstypes.create"),
  validate(createBusinessTypeSchema),
  createBusinessType
);

// =====================================================
// PUBLIC BUSINESS TYPES
// =====================================================
// Used for public/signup dropdown.
// No authentication or permission required.

router.get(
  "/public/business/:businessId",
  getPublicBusinessTypesByBusiness
);

// =====================================================
// GET ALL BUSINESS TYPES
// =====================================================

router.get(
  "/",
  protect,
  authorize("businesstypes.read"),
  getAllBusinessTypes
);

// =====================================================
// GET BUSINESS TYPES BY BUSINESS
// =====================================================

router.get(
  "/business/:businessId",
  protect,
  authorize("businesstypes.read"),
  getBusinessTypesByBusiness
);

// =====================================================
// GET BUSINESS TYPE BY ID
// =====================================================

router.get(
  "/:id",
  protect,
  authorize("businesstypes.read"),
  getBusinessTypeById
);

// =====================================================
// UPDATE BUSINESS TYPE
// =====================================================

router.put(
  "/:id",
  protect,
  authorize("businesstypes.update"),
  validate(updateBusinessTypeSchema),
  updateBusinessType
);

// =====================================================
// DELETE BUSINESS TYPE
// =====================================================

router.delete(
  "/:id",
  protect,
  authorize("businesstypes.delete"),
  deleteBusinessType
);

export default router;