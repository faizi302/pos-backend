import express from "express";

import {
  createModel,
  getAllModels,
  getModelsByBrand,
  getModelById,
  updateModel,
  deleteModel,
} from "../controllers/modelController.js";

import validate from "../middlewares/validate.js";

import {
  createModelSchema,
  updateModelSchema,
} from "../validations/model.validation.js";

import { protect } from "../middlewares/auth.middleware.js";
import { authorize } from "../middlewares/permission.middleware.js";

const router = express.Router();

// =====================================================
// MODEL CRUD
// =====================================================

// Create Model
router.post(
  "/",
  protect,
  authorize("models.create"),
  validate(createModelSchema),
  createModel
);

// Get All Models
router.get(
  "/",
  protect,
  authorize("models.read"),
  getAllModels
);

// Get Models By Brand
router.get(
  "/brand/:brandId",
  protect,
  authorize("models.read"),
  getModelsByBrand
);

// Get Model By ID
router.get(
  "/:id",
  protect,
  authorize("models.read"),
  getModelById
);

// Update Model
router.put(
  "/:id",
  protect,
  authorize("models.update"),
  validate(updateModelSchema),
  updateModel
);

// Delete Model
router.delete(
  "/:id",
  protect,
  authorize("models.delete"),
  deleteModel
);

export default router;