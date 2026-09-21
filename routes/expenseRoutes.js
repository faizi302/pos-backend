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

import { protect } from "../middlewares/auth.middleware.js";
import { authorize } from "../middlewares/permission.middleware.js";
import validate from "../middlewares/validate.js";

import {
  createExpenseSchema,
  updateExpenseSchema,
} from "../validations/expense.validation.js";

const router = express.Router();

// =====================================================
// CREATE EXPENSE
// POST /api/expenses
// =====================================================
router.post(
  "/",
  protect,
  authorize("expenses.create"),
  validate(createExpenseSchema),
  createExpense
);

// =====================================================
// GET ALL EXPENSES
// GET /api/expenses
// =====================================================
router.get(
  "/",
  protect,
  authorize("expenses.read"),
  getAllExpenses
);

// =====================================================
// GET EXPENSE BY ID
// GET /api/expenses/:id
// =====================================================
router.get(
  "/:id",
  protect,
  authorize("expenses.read"),
  getExpenseById
);

// =====================================================
// UPDATE EXPENSE
// PATCH /api/expenses/:id
// =====================================================
router.patch(
  "/:id",
  protect,
  authorize("expenses.update"),
  validate(updateExpenseSchema),
  updateExpense
);

// =====================================================
// CANCEL EXPENSE
// PATCH /api/expenses/:id/cancel
// =====================================================
router.patch(
  "/:id/cancel",
  protect,
  authorize("expenses.update"),
  cancelExpense
);

// =====================================================
// RESTORE EXPENSE
// PATCH /api/expenses/:id/restore
// =====================================================
router.patch(
  "/:id/restore",
  protect,
  authorize("expenses.update"),
  restoreExpense
);

// =====================================================
// SOFT DELETE EXPENSE
// DELETE /api/expenses/:id
// =====================================================
router.delete(
  "/:id",
  protect,
  authorize("expenses.delete"),
  deleteExpense
);

export default router;