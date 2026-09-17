import mongoose from "mongoose";

import Expense from "../models/Expense.js";
import Business from "../models/Business.js";
import ExpenseCategory from "../models/ExpenseCategory.js";

import {
  successResponse,
  errorResponse,
} from "../utils/apiResponse.js";

// --------------------------------------------------
// GET BUSINESS ID
// --------------------------------------------------

const getBusinessId = (req) => {
  // SuperAdmin can work with a selected business
  if (req.user.role?.slug === "super-admin") {
    return req.body.business || req.query.business || null;
  }

  // Admin / Manager always use their own business
  return req.user.business?._id || req.user.business || null;
};

// --------------------------------------------------
// GENERATE EXPENSE NUMBER
// --------------------------------------------------

const generateExpenseNumber = async (businessId) => {
  const lastExpense = await Expense.findOne({
    business: businessId,
  })
    .sort({ createdAt: -1 })
    .select("expenseNumber");

  let nextNumber = 1;

  if (lastExpense?.expenseNumber) {
    const match =
      lastExpense.expenseNumber.match(/(\d+)$/);

    if (match) {
      nextNumber = Number(match[1]) + 1;
    }
  }

  return `EXP-${String(nextNumber).padStart(6, "0")}`;
};

// --------------------------------------------------
// CREATE EXPENSE
// --------------------------------------------------

export const createExpense = async (req, res, next) => {
  try {
    const businessId = getBusinessId(req);

    if (!businessId) {
      return errorResponse(
        res,
        400,
        "Business is required."
      );
    }

    if (!mongoose.Types.ObjectId.isValid(businessId)) {
      return errorResponse(
        res,
        400,
        "Invalid business ID."
      );
    }

    const business = await Business.findOne({
      _id: businessId,
      isActive: true,
    });

    if (!business) {
      return errorResponse(
        res,
        404,
        "Active business not found."
      );
    }

    const {
      expenseCategory,
      expenseDate,
      title,
      description,
      amount,
      paymentMethod,
      referenceNumber,
      status,
      notes,
    } = req.body;

    // ----------------------------------------------
    // Validate Expense Category
    // ----------------------------------------------

    if (
      !mongoose.Types.ObjectId.isValid(
        expenseCategory
      )
    ) {
      return errorResponse(
        res,
        400,
        "Invalid expense category ID."
      );
    }

    const category = await ExpenseCategory.findOne({
      _id: expenseCategory,
      business: businessId,
      isActive: true,
    });

    if (!category) {
      return errorResponse(
        res,
        404,
        "Active expense category not found."
      );
    }

    // ----------------------------------------------
    // Generate Expense Number
    // ----------------------------------------------

    const expenseNumber =
      req.body.expenseNumber ||
      (await generateExpenseNumber(businessId));

    // ----------------------------------------------
    // Duplicate Check
    // ----------------------------------------------

    const existingExpense = await Expense.findOne({
      business: businessId,
      expenseNumber,
    });

    if (existingExpense) {
      return errorResponse(
        res,
        409,
        "Expense with this number already exists."
      );
    }

    // ----------------------------------------------
    // Create
    // ----------------------------------------------

    const expense = await Expense.create({
      business: businessId,
      expenseCategory,
      expenseNumber,
      expenseDate,
      title,
      description,
      amount,
      paymentMethod,
      referenceNumber,
      status,
      notes,
      createdBy: req.user._id,
    });

    const populatedExpense =
      await Expense.findById(expense._id)
        .populate(
          "expenseCategory",
          "name slug description"
        )
        .populate("createdBy", "name email");

    return successResponse(
      res,
      201,
      "Expense created successfully.",
      populatedExpense
    );
  } catch (error) {
    next(error);
  }
};

// --------------------------------------------------
// GET ALL EXPENSES
// --------------------------------------------------

export const getAllExpenses = async (
  req,
  res,
  next
) => {
  try {
    const businessId = getBusinessId(req);

    if (!businessId) {
      return errorResponse(
        res,
        400,
        "Business is required."
      );
    }

    if (!mongoose.Types.ObjectId.isValid(businessId)) {
      return errorResponse(
        res,
        400,
        "Invalid business ID."
      );
    }

    const {
      page = 1,
      limit = 20,
      search = "",
      expenseCategory,
      paymentMethod,
      status,
      startDate,
      endDate,
    } = req.query;

    const currentPage = Math.max(
      Number(page),
      1
    );

    const currentLimit = Math.min(
      Math.max(Number(limit), 1),
      100
    );

    const skip =
      (currentPage - 1) * currentLimit;

    const filter = {
      business: businessId,
    };

    // ----------------------------------------------
    // Search
    // ----------------------------------------------

    if (search.trim()) {
      filter.$or = [
        {
          title: {
            $regex: search.trim(),
            $options: "i",
          },
        },
        {
          expenseNumber: {
            $regex: search.trim(),
            $options: "i",
          },
        },
        {
          referenceNumber: {
            $regex: search.trim(),
            $options: "i",
          },
        },
        {
          description: {
            $regex: search.trim(),
            $options: "i",
          },
        },
      ];
    }

    // ----------------------------------------------
    // Category
    // ----------------------------------------------

    if (expenseCategory) {
      if (
        !mongoose.Types.ObjectId.isValid(
          expenseCategory
        )
      ) {
        return errorResponse(
          res,
          400,
          "Invalid expense category ID."
        );
      }

      filter.expenseCategory =
        expenseCategory;
    }

    // ----------------------------------------------
    // Payment Method
    // ----------------------------------------------

    if (paymentMethod) {
      filter.paymentMethod = paymentMethod;
    }

    // ----------------------------------------------
    // Status
    // ----------------------------------------------

    if (status) {
      filter.status = status;
    }

    // ----------------------------------------------
    // Date Range
    // ----------------------------------------------

    if (startDate || endDate) {
      filter.expenseDate = {};

      if (startDate) {
        const start = new Date(startDate);

        if (Number.isNaN(start.getTime())) {
          return errorResponse(
            res,
            400,
            "Invalid start date."
          );
        }

        start.setHours(0, 0, 0, 0);

        filter.expenseDate.$gte = start;
      }

      if (endDate) {
        const end = new Date(endDate);

        if (Number.isNaN(end.getTime())) {
          return errorResponse(
            res,
            400,
            "Invalid end date."
          );
        }

        end.setHours(23, 59, 59, 999);

        filter.expenseDate.$lte = end;
      }
    }

    const [expenses, total] =
      await Promise.all([
        Expense.find(filter)
          .populate(
            "expenseCategory",
            "name slug"
          )
          .populate(
            "createdBy",
            "name email"
          )
          .populate(
            "updatedBy",
            "name email"
          )
          .sort({
            expenseDate: -1,
            createdAt: -1,
          })
          .skip(skip)
          .limit(currentLimit),

        Expense.countDocuments(filter),
      ]);

    return successResponse(
      res,
      200,
      "Expenses fetched successfully.",
      {
        expenses,
        pagination: {
          total,
          page: currentPage,
          limit: currentLimit,
          totalPages: Math.ceil(
            total / currentLimit
          ),
        },
      }
    );
  } catch (error) {
    next(error);
  }
};

// --------------------------------------------------
// GET EXPENSE BY ID
// --------------------------------------------------

export const getExpenseById = async (
  req,
  res,
  next
) => {
  try {
    const businessId = getBusinessId(req);
    const { id } = req.params;

    if (!businessId) {
      return errorResponse(
        res,
        400,
        "Business is required."
      );
    }

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return errorResponse(
        res,
        400,
        "Invalid expense ID."
      );
    }

    const expense = await Expense.findOne({
      _id: id,
      business: businessId,
    })
      .populate(
        "expenseCategory",
        "name slug description"
      )
      .populate(
        "createdBy",
        "name email"
      )
      .populate(
        "updatedBy",
        "name email"
      );

    if (!expense) {
      return errorResponse(
        res,
        404,
        "Expense not found."
      );
    }

    return successResponse(
      res,
      200,
      "Expense fetched successfully.",
      expense
    );
  } catch (error) {
    next(error);
  }
};

// --------------------------------------------------
// UPDATE EXPENSE
// --------------------------------------------------

export const updateExpense = async (
  req,
  res,
  next
) => {
  try {
    const businessId = getBusinessId(req);
    const { id } = req.params;

    if (!businessId) {
      return errorResponse(
        res,
        400,
        "Business is required."
      );
    }

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return errorResponse(
        res,
        400,
        "Invalid expense ID."
      );
    }

    const expense = await Expense.findOne({
      _id: id,
      business: businessId,
    });

    if (!expense) {
      return errorResponse(
        res,
        404,
        "Expense not found."
      );
    }

    if (expense.status === "cancelled") {
      return errorResponse(
        res,
        400,
        "Cancelled expenses cannot be updated."
      );
    }

    const {
      expenseCategory,
      expenseDate,
      title,
      description,
      amount,
      paymentMethod,
      referenceNumber,
      status,
      notes,
    } = req.body;

    // ----------------------------------------------
    // Category
    // ----------------------------------------------

    if (expenseCategory) {
      if (
        !mongoose.Types.ObjectId.isValid(
          expenseCategory
        )
      ) {
        return errorResponse(
          res,
          400,
          "Invalid expense category ID."
        );
      }

      const category =
        await ExpenseCategory.findOne({
          _id: expenseCategory,
          business: businessId,
          isActive: true,
        });

      if (!category) {
        return errorResponse(
          res,
          404,
          "Active expense category not found."
        );
      }

      expense.expenseCategory =
        expenseCategory;
    }

    // ----------------------------------------------
    // Update Fields
    // ----------------------------------------------

    if (expenseDate !== undefined) {
      expense.expenseDate = expenseDate;
    }

    if (title !== undefined) {
      expense.title = title;
    }

    if (description !== undefined) {
      expense.description = description;
    }

    if (amount !== undefined) {
      expense.amount = amount;
    }

    if (paymentMethod !== undefined) {
      expense.paymentMethod = paymentMethod;
    }

    if (referenceNumber !== undefined) {
      expense.referenceNumber =
        referenceNumber;
    }

    if (status !== undefined) {
      expense.status = status;
    }

    if (notes !== undefined) {
      expense.notes = notes;
    }

    expense.updatedBy = req.user._id;

    await expense.save();

    const updatedExpense =
      await Expense.findById(expense._id)
        .populate(
          "expenseCategory",
          "name slug description"
        )
        .populate(
          "createdBy",
          "name email"
        )
        .populate(
          "updatedBy",
          "name email"
        );

    return successResponse(
      res,
      200,
      "Expense updated successfully.",
      updatedExpense
    );
  } catch (error) {
    next(error);
  }
};

// --------------------------------------------------
// CANCEL EXPENSE
// --------------------------------------------------

export const cancelExpense = async (
  req,
  res,
  next
) => {
  try {
    const businessId = getBusinessId(req);
    const { id } = req.params;

    if (!businessId) {
      return errorResponse(
        res,
        400,
        "Business is required."
      );
    }

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return errorResponse(
        res,
        400,
        "Invalid expense ID."
      );
    }

    const expense = await Expense.findOne({
      _id: id,
      business: businessId,
    });

    if (!expense) {
      return errorResponse(
        res,
        404,
        "Expense not found."
      );
    }

    if (expense.status === "cancelled") {
      return errorResponse(
        res,
        400,
        "Expense is already cancelled."
      );
    }

    expense.status = "cancelled";
    expense.updatedBy = req.user._id;

    await expense.save();

    return successResponse(
      res,
      200,
      "Expense cancelled successfully.",
      expense
    );
  } catch (error) {
    next(error);
  }
};

// --------------------------------------------------
// RESTORE EXPENSE
// --------------------------------------------------

export const restoreExpense = async (
  req,
  res,
  next
) => {
  try {
    const businessId = getBusinessId(req);
    const { id } = req.params;

    if (!businessId) {
      return errorResponse(
        res,
        400,
        "Business is required."
      );
    }

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return errorResponse(
        res,
        400,
        "Invalid expense ID."
      );
    }

    const expense = await Expense.findOne({
      _id: id,
      business: businessId,
    });

    if (!expense) {
      return errorResponse(
        res,
        404,
        "Expense not found."
      );
    }

    if (expense.status !== "cancelled") {
      return errorResponse(
        res,
        400,
        "Only cancelled expenses can be restored."
      );
    }

    expense.status = "paid";
    expense.updatedBy = req.user._id;

    await expense.save();

    return successResponse(
      res,
      200,
      "Expense restored successfully.",
      expense
    );
  } catch (error) {
    next(error);
  }
};

// --------------------------------------------------
// DELETE EXPENSE
// --------------------------------------------------

export const deleteExpense = async (
  req,
  res,
  next
) => {
  try {
    const businessId = getBusinessId(req);
    const { id } = req.params;

    if (!businessId) {
      return errorResponse(
        res,
        400,
        "Business is required."
      );
    }

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return errorResponse(
        res,
        400,
        "Invalid expense ID."
      );
    }

    const expense = await Expense.findOne({
      _id: id,
      business: businessId,
    });

    if (!expense) {
      return errorResponse(
        res,
        404,
        "Expense not found."
      );
    }

    // Keep accounting history.
    expense.status = "cancelled";
    expense.updatedBy = req.user._id;

    await expense.save();

    return successResponse(
      res,
      200,
      "Expense cancelled successfully.",
      expense
    );
  } catch (error) {
    next(error);
  }
};