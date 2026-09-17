import express from "express";

import {
  createCategory,
  getAllCategories,
  getCategoryById,
  updateCategory,
  deleteCategory,
  restoreCategory,
} from "../controllers/categoryController.js";

import { protect } from "../middlewares/auth.middleware.js";
import { authorize } from "../middlewares/permission.middleware.js";
import upload from "../middlewares/upload.middleware.js";

const router = express.Router();

// ======================================================
// CREATE CATEGORY
// POST /api/categories
// ======================================================

router.post(
  "/",
  protect,
  authorize("categories.create"),
  upload.single("image"),
  createCategory
);

// ======================================================
// GET ALL CATEGORIES
// GET /api/categories
// ======================================================

router.get(
  "/",
  protect,
  authorize("categories.read"),
  getAllCategories
);

// ======================================================
// GET CATEGORY BY ID
// GET /api/categories/:id
// ======================================================

router.get(
  "/:id",
  protect,
  authorize("categories.read"),
  getCategoryById
);

// ======================================================
// UPDATE CATEGORY
// PATCH /api/categories/:id
// ======================================================

router.patch(
  "/:id",
  protect,
  authorize("categories.update"),
  upload.single("image"),
  updateCategory
);

// ======================================================
// DELETE CATEGORY
// DELETE /api/categories/:id
// ======================================================

router.delete(
  "/:id",
  protect,
  authorize("categories.delete"),
  deleteCategory
);

// ======================================================
// RESTORE CATEGORY
// PATCH /api/categories/:id/restore
// ======================================================

router.patch(
  "/:id/restore",
  protect,
  authorize("categories.update"),
  restoreCategory
);

export default router;