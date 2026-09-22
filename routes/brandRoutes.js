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

router.post(
  "/",
  protect,
  authorize("brands.create"),
  validate(createBrandSchema),
  createBrand
);

router.get("/", protect, authorize("brands.read"), getAllBrands);

router.get(
  "/business-type/:businessTypeId",
  protect,
  authorize("brands.read"),
  getBrandsByBusinessType
);

router.get("/:id", protect, authorize("brands.read"), getBrandById);

router.put(
  "/:id",
  protect,
  authorize("brands.update"),
  validate(updateBrandSchema),
  updateBrand
);

router.delete(
  "/:id",
  protect,
  authorize("brands.delete"),
  deleteBrand
);

export default router;