import express from "express";

import {
  createBusiness,
  getPublicBusinesses,
  getAllBusinesses,
  getBusinessById,
  updateBusiness,
  deleteBusiness,
} from "../controllers/businessController.js";

import validate from "../middlewares/validate.js";

import {
  createBusinessSchema,
  updateBusinessSchema,
} from "../validations/business.validation.js";

import { protect } from "../middlewares/auth.middleware.js";
import { authorize } from "../middlewares/permission.middleware.js";

const router = express.Router();

// =====================================================
// BUSINESS CRUD
// =====================================================

// Create Business
router.post(
  "/",
//   protect,
//   authorize("businesses.create"),
  validate(createBusinessSchema),
  createBusiness
);

// Public
router.get(
  "/public",
  getPublicBusinesses
);

// Get All Businesses
router.get(
  "/",
  protect,
  authorize("businesses.read"),
  getAllBusinesses
);

// Get Business By ID
router.get(
  "/:id",
  protect,
  authorize("businesses.read"),
  getBusinessById
);

// Update Business
router.put(
  "/:id",
  protect,
  authorize("businesses.update"),
  validate(updateBusinessSchema),
  updateBusiness
);

// Delete Business
router.delete(
  "/:id",
  protect,
  authorize("businesses.delete"),
  deleteBusiness
);

export default router;
