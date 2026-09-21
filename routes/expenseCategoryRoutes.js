import express from "express";

import {
  createExpenseCategory,
  getAllExpenseCategories,
  getExpenseCategoryById,
  updateExpenseCategory,
  deleteExpenseCategory,
  restoreExpenseCategory,
} from "../controllers/expenseCategoryController.js";

import { protect } from "../middlewares/auth.middleware.js";
import { authorize } from "../middlewares/permission.middleware.js";
import validate from "../middlewares/validate.js";

import {
  createExpenseCategorySchema,
  updateExpenseCategorySchema,
} from "../validations/expenseCategory.validation.js";

const router = express.Router();

// =====================================================
// CREATE EXPENSE CATEGORY
// POST /api/expense-categories
// =====================================================
router.post(
  "/",
  protect,
  authorize("expense-categories.create"),
  validate(createExpenseCategorySchema),
  createExpenseCategory
);

// =====================================================
// GET ALL EXPENSE CATEGORIES
// GET /api/expense-categories
// =====================================================
router.get(
  "/",
  protect,
  authorize("expense-categories.read"),
  getAllExpenseCategories
);

// =====================================================
// GET EXPENSE CATEGORY BY ID
// GET /api/expense-categories/:id
// =====================================================
router.get(
  "/:id",
  protect,
  authorize("expense-categories.read"),
  getExpenseCategoryById
);

// =====================================================
// UPDATE EXPENSE CATEGORY
// PATCH /api/expense-categories/:id
// =====================================================
router.patch(
  "/:id",
  protect,
  authorize("expense-categories.update"),
  validate(updateExpenseCategorySchema),
  updateExpenseCategory
);

// =====================================================
// SOFT DELETE EXPENSE CATEGORY
// DELETE /api/expense-categories/:id
// =====================================================
router.delete(
  "/:id",
  protect,
  authorize("expense-categories.delete"),
  deleteExpenseCategory
);

// =====================================================
// RESTORE EXPENSE CATEGORY
// PATCH /api/expense-categories/:id/restore
// =====================================================
router.patch(
  "/:id/restore",
  protect,
  authorize("expense-categories.update"),
  restoreExpenseCategory
);

export default router;