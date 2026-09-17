import express from "express";

import {
  createExpense,
  getAllExpenses,
  getExpenseById,
  updateExpense,
  cancelExpense,
  restoreExpense,
  deleteExpense,
} from "../controllers/expenseController.js";

import {protect} from "../middlewares/auth.middleware.js";
import { authorize } from "../middlewares/permission.middleware.js";
import validate from "../middlewares/validate.js";

import {
  createExpenseSchema,
  updateExpenseSchema,
} from "../validations/expense.validation.js";

const router = express.Router();

// Create expense
router.post(
  "/",
  protect,
  authorize("expenses.create"),
  validate(createExpenseSchema),
  createExpense
);

// Get all expenses
router.get(
  "/",
  protect,
  authorize("expenses.read"),
  getAllExpenses
);

// Get expense by ID
router.get(
  "/:id",
  protect,
  authorize("expenses.read"),
  getExpenseById
);

// Update expense
router.patch(
  "/:id",
  protect,
  authorize("expenses.update"),
  validate(updateExpenseSchema),
  updateExpense
);

// Cancel expense
router.patch(
  "/:id/cancel",
  protect,
  authorize("expenses.update"),
  cancelExpense
);

// Restore expense
router.patch(
  "/:id/restore",
  protect,
  authorize("expenses.update"),
  restoreExpense
);

// Soft delete
router.delete(
  "/:id",
  protect,
  authorize("expenses.delete"),
  deleteExpense
);

export default router;