import express from "express";

import {
  createExpenseCategory,
  getAllExpenseCategories,
  getExpenseCategoryById,
  updateExpenseCategory,
  deleteExpenseCategory,
  restoreExpenseCategory,
} from "../controllers/expenseCategoryController.js";

import {protect} from "../middlewares/auth.middleware.js";
import { authorize } from "../middlewares/permission.middleware.js";
import validate from "../middlewares/validate.js";

import {
  createExpenseCategorySchema,
  updateExpenseCategorySchema,
} from "../validations/expenseCategory.validation.js";

const router = express.Router();

// Create
router.post(
  "/",
  protect,
  authorize("expense-categories.create"),
  validate(createExpenseCategorySchema),
  createExpenseCategory
);

// Get all
router.get(
  "/",
  protect,
  authorize("expense-categories.read"),
  getAllExpenseCategories
);

// Get by ID
router.get(
  "/:id",
  protect,
  authorize("expense-categories.read"),
  getExpenseCategoryById
);

// Update
router.patch(
  "/:id",
  protect,
  authorize("expense-categories.update"),
  validate(updateExpenseCategorySchema),
  updateExpenseCategory
);

// Soft delete
router.delete(
  "/:id",
  protect,
  authorize("expense-categories.delete"),
  deleteExpenseCategory
);

// Restore
router.patch(
  "/:id/restore",
  protect,
  authorize("expense-categories.update"),
  restoreExpenseCategory
);

export default router;