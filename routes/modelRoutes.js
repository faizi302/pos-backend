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

router.post(
  "/",
  protect,
  authorize("models.create"),
  validate(createModelSchema),
  createModel
);

router.get("/", protect, authorize("models.read"), getAllModels);

router.get(
  "/brand/:brandId",
  protect,
  authorize("models.read"),
  getModelsByBrand
);

router.get("/:id", protect, authorize("models.read"), getModelById);

router.put(
  "/:id",
  protect,
  authorize("models.update"),
  validate(updateModelSchema),
  updateModel
);

router.delete(
  "/:id",
  protect,
  authorize("models.delete"),
  deleteModel
);

export default router;