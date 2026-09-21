import mongoose from "mongoose";

import Expense from "../models/Expense.js";
import Business from "../models/Business.js";
import ExpenseCategory from "../models/ExpenseCategory.js";

import {
  successResponse,
  errorResponse,
} from "../utils/apiResponse.js";

import {
  getTenantContext,
  buildTenantQuery,
  isValidObjectId,
} from "../utils/tenantContext.js";

// ======================================================
// GET EXPENSE SCOPE
// ======================================================
//
// SUPER ADMIN
// → Can select tenantOwner + business
//
// ADMIN
// → tenantOwner = Admin._id
// → business = Admin.business
//
// MANAGER
// → tenantOwner = Admin._id
// → business = Admin.business
//
// IMPORTANT:
// Admin / Manager values are never taken from
// req.body or req.query.
//
// ======================================================

const getExpenseScope = async (req, options = {}) => {
  const { requireCreateContext = false } = options;

  const tenant = await getTenantContext(req);

  // ====================================================
  // SUPER ADMIN
  // ====================================================

  if (tenant.isSuperAdmin) {
    const tenantOwner =
      req.body?.tenantOwner ||
      req.query?.tenantOwner ||
      null;

    const business =
      req.body?.business ||
      req.query?.business ||
      null;

    // -----------------------------------------------
    // CREATE
    // -----------------------------------------------

    if (requireCreateContext) {
      if (!tenantOwner) {
        throw new Error(
          "Tenant owner is required for Super Admin."
        );
      }

      if (!business) {
        throw new Error(
          "Business is required for Super Admin."
        );
      }

      if (!isValidObjectId(tenantOwner)) {
        throw new Error(
          "Invalid tenant owner ID."
        );
      }

      if (!isValidObjectId(business)) {
        throw new Error(
          "Invalid business ID."
        );
      }

      return {
        tenantOwner:
          new mongoose.Types.ObjectId(tenantOwner),

        business:
          new mongoose.Types.ObjectId(business),
      };
    }

    // -----------------------------------------------
    // READ / UPDATE / DELETE
    // -----------------------------------------------

    const scope = {};

    if (tenantOwner) {
      if (!isValidObjectId(tenantOwner)) {
        throw new Error(
          "Invalid tenant owner ID."
        );
      }

      scope.tenantOwner =
        new mongoose.Types.ObjectId(tenantOwner);
    }

    if (business) {
      if (!isValidObjectId(business)) {
        throw new Error(
          "Invalid business ID."
        );
      }

      scope.business =
        new mongoose.Types.ObjectId(business);
    }

    return scope;
  }

  // ====================================================
  // ADMIN / MANAGER
  // ====================================================

  const scope = buildTenantQuery(tenant);

  if (!tenant.business) {
    throw new Error(
      "Business is not assigned to this tenant."
    );
  }

  scope.business = tenant.business;

  return scope;
};

// ======================================================
// ESCAPE REGEX
// ======================================================

const escapeRegex = (value = "") => {
  return value.replace(
    /[.*+?^${}()|[\]\\]/g,
    "\\$&"
  );
};

// ======================================================
// GENERATE EXPENSE NUMBER
// ======================================================
//
// IMPORTANT:
// Generation is tenant scoped.
//
// Admin A:
// EXP-000001
//
// Admin B:
// EXP-000001
//
// Both are allowed.
//
// ======================================================

const generateExpenseNumber = async (
  tenantOwner,
  session = null
) => {
  const query = {
    tenantOwner,
  };

  let queryBuilder = Expense.findOne(query)
    .sort({
      createdAt: -1,
    })
    .select("expenseNumber");

  if (session) {
    queryBuilder = queryBuilder.session(session);
  }

  const lastExpense =
    await queryBuilder;

  let nextNumber = 1;

  if (lastExpense?.expenseNumber) {
    const match =
      lastExpense.expenseNumber.match(
        /(\d+)$/
      );

    if (match) {
      nextNumber =
        Number(match[1]) + 1;
    }
  }

  return `EXP-${String(nextNumber).padStart(
    6,
    "0"
  )}`;
};

// ======================================================
// CREATE EXPENSE
// ======================================================

export const createExpense = async (
  req,
  res,
  next
) => {
  try {
    const scope =
      await getExpenseScope(req, {
        requireCreateContext: true,
      });

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
      receipt,
    } = req.body;

    // ==================================================
    // VALIDATE BUSINESS
    // ==================================================

    const business =
      await Business.findOne({
        _id: scope.business,
        isActive: true,
      });

    if (!business) {
      return errorResponse(
        res,
        404,
        "Active business not found."
      );
    }

    // ==================================================
    // VALIDATE EXPENSE CATEGORY
    // ==================================================

    if (
      !isValidObjectId(
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
        business: scope.business,
        isActive: true,
      });

    if (!category) {
      return errorResponse(
        res,
        404,
        "Active expense category not found."
      );
    }

    // ==================================================
    // EXPENSE NUMBER
    // ==================================================

    let finalExpenseNumber =
      req.body.expenseNumber?.trim();

    if (finalExpenseNumber) {
      finalExpenseNumber =
        finalExpenseNumber.toUpperCase();
    } else {
      finalExpenseNumber =
        await generateExpenseNumber(
          scope.tenantOwner
        );
    }

    // ==================================================
    // DUPLICATE CHECK
    // ==================================================

    const existingExpense =
      await Expense.findOne({
        tenantOwner:
          scope.tenantOwner,

        expenseNumber:
          finalExpenseNumber,
      });

    if (existingExpense) {
      return errorResponse(
        res,
        409,
        "Expense with this number already exists in this tenant."
      );
    }

    // ==================================================
    // CREATE
    // ==================================================

    const expense =
      await Expense.create({
        tenantOwner:
          scope.tenantOwner,

        business:
          scope.business,

        expenseCategory,

        expenseNumber:
          finalExpenseNumber,

        expenseDate,

        title,

        description,

        amount,

        paymentMethod,

        referenceNumber,

        receipt,

        status,

        notes,

        createdBy:
          req.user._id,
      });

    // ==================================================
    // POPULATE
    // ==================================================

    const populatedExpense =
      await Expense.findById(
        expense._id
      )
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
      201,
      "Expense created successfully.",
      populatedExpense
    );
  } catch (error) {
    // MongoDB duplicate key
    if (error?.code === 11000) {
      return errorResponse(
        res,
        409,
        "Expense number already exists in this tenant."
      );
    }

    next(error);
  }
};

// ======================================================
// GET ALL EXPENSES
// ======================================================

export const getAllExpenses = async (
  req,
  res,
  next
) => {
  try {
    const scope =
      await getExpenseScope(req);

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
      Number(page) || 1,
      1
    );

    const currentLimit = Math.min(
      Math.max(
        Number(limit) || 20,
        1
      ),
      100
    );

    const skip =
      (currentPage - 1) *
      currentLimit;

    // ==================================================
    // BASE TENANT FILTER
    // ==================================================

    const filter = {
      ...scope,
    };

    // ==================================================
    // SEARCH
    // ==================================================

    if (search.trim()) {
      const safeSearch =
        escapeRegex(search.trim());

      filter.$or = [
        {
          title: {
            $regex: safeSearch,
            $options: "i",
          },
        },
        {
          expenseNumber: {
            $regex: safeSearch,
            $options: "i",
          },
        },
        {
          referenceNumber: {
            $regex: safeSearch,
            $options: "i",
          },
        },
        {
          description: {
            $regex: safeSearch,
            $options: "i",
          },
        },
      ];
    }

    // ==================================================
    // CATEGORY
    // ==================================================

    if (expenseCategory) {
      if (
        !isValidObjectId(
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

    // ==================================================
    // PAYMENT METHOD
    // ==================================================

    if (paymentMethod) {
      filter.paymentMethod =
        paymentMethod;
    }

    // ==================================================
    // STATUS
    // ==================================================

    if (status) {
      filter.status = status;
    }

    // ==================================================
    // DATE RANGE
    // ==================================================

    if (startDate || endDate) {
      filter.expenseDate = {};

      if (startDate) {
        const start =
          new Date(startDate);

        if (
          Number.isNaN(
            start.getTime()
          )
        ) {
          return errorResponse(
            res,
            400,
            "Invalid start date."
          );
        }

        start.setHours(
          0,
          0,
          0,
          0
        );

        filter.expenseDate.$gte =
          start;
      }

      if (endDate) {
        const end =
          new Date(endDate);

        if (
          Number.isNaN(
            end.getTime()
          )
        ) {
          return errorResponse(
            res,
            400,
            "Invalid end date."
          );
        }

        end.setHours(
          23,
          59,
          59,
          999
        );

        filter.expenseDate.$lte =
          end;
      }
    }

    // ==================================================
    // FETCH
    // ==================================================

    const [
      expenses,
      total,
    ] = await Promise.all([
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

      Expense.countDocuments(
        filter
      ),
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

          totalPages:
            Math.ceil(
              total /
                currentLimit
            ),
        },
      }
    );
  } catch (error) {
    next(error);
  }
};

// ======================================================
// GET EXPENSE BY ID
// ======================================================

export const getExpenseById = async (
  req,
  res,
  next
) => {
  try {
    const scope =
      await getExpenseScope(req);

    const { id } = req.params;

    if (!isValidObjectId(id)) {
      return errorResponse(
        res,
        400,
        "Invalid expense ID."
      );
    }

    const expense =
      await Expense.findOne({
        _id: id,
        ...scope,
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

// ======================================================
// UPDATE EXPENSE
// ======================================================

export const updateExpense = async (
  req,
  res,
  next
) => {
  try {
    const scope =
      await getExpenseScope(req);

    const { id } = req.params;

    if (!isValidObjectId(id)) {
      return errorResponse(
        res,
        400,
        "Invalid expense ID."
      );
    }

    // ==================================================
    // FIND ONLY INSIDE TENANT
    // ==================================================

    const expense =
      await Expense.findOne({
        _id: id,
        ...scope,
      });

    if (!expense) {
      return errorResponse(
        res,
        404,
        "Expense not found."
      );
    }

    // ==================================================
    // CANCELLED EXPENSE
    // ==================================================

    if (
      expense.status ===
      "cancelled"
    ) {
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
      receipt,
    } = req.body;

    // ==================================================
    // CATEGORY
    // ==================================================

    if (expenseCategory) {
      if (
        !isValidObjectId(
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
          business:
            expense.business,
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

    // ==================================================
    // EXPENSE DATE
    // ==================================================

    if (
      expenseDate !==
      undefined
    ) {
      expense.expenseDate =
        expenseDate;
    }

    // ==================================================
    // TITLE
    // ==================================================

    if (
      title !== undefined
    ) {
      expense.title = title;
    }

    // ==================================================
    // DESCRIPTION
    // ==================================================

    if (
      description !==
      undefined
    ) {
      expense.description =
        description;
    }

    // ==================================================
    // AMOUNT
    // ==================================================

    if (
      amount !== undefined
    ) {
      expense.amount =
        amount;
    }

    // ==================================================
    // PAYMENT METHOD
    // ==================================================

    if (
      paymentMethod !==
      undefined
    ) {
      expense.paymentMethod =
        paymentMethod;
    }

    // ==================================================
    // REFERENCE NUMBER
    // ==================================================

    if (
      referenceNumber !==
      undefined
    ) {
      expense.referenceNumber =
        referenceNumber;
    }

    // ==================================================
    // STATUS
    // ==================================================

    if (
      status !== undefined
    ) {
      expense.status =
        status;
    }

    // ==================================================
    // NOTES
    // ==================================================

    if (
      notes !== undefined
    ) {
      expense.notes = notes;
    }

    // ==================================================
    // RECEIPT
    // ==================================================

    if (
      receipt !== undefined
    ) {
      expense.receipt =
        receipt;
    }

    // ==================================================
    // IMPORTANT
    // ==================================================
    // Do NOT allow Admin / Manager to change:
    //
    // tenantOwner
    // business
    // expenseNumber
    // createdBy
    //
    // They remain unchanged.
    // ==================================================

    expense.updatedBy =
      req.user._id;

    await expense.save();

    // ==================================================
    // POPULATE
    // ==================================================

    const updatedExpense =
      await Expense.findById(
        expense._id
      )
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
    if (error?.code === 11000) {
      return errorResponse(
        res,
        409,
        "Expense number already exists in this tenant."
      );
    }

    next(error);
  }
};

// ======================================================
// CANCEL EXPENSE
// ======================================================

export const cancelExpense = async (
  req,
  res,
  next
) => {
  try {
    const scope =
      await getExpenseScope(req);

    const { id } = req.params;

    if (!isValidObjectId(id)) {
      return errorResponse(
        res,
        400,
        "Invalid expense ID."
      );
    }

    const expense =
      await Expense.findOne({
        _id: id,
        ...scope,
      });

    if (!expense) {
      return errorResponse(
        res,
        404,
        "Expense not found."
      );
    }

    if (
      expense.status ===
      "cancelled"
    ) {
      return errorResponse(
        res,
        400,
        "Expense is already cancelled."
      );
    }

    expense.status =
      "cancelled";

    expense.updatedBy =
      req.user._id;

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

// ======================================================
// RESTORE EXPENSE
// ======================================================

export const restoreExpense = async (
  req,
  res,
  next
) => {
  try {
    const scope =
      await getExpenseScope(req);

    const { id } = req.params;

    if (!isValidObjectId(id)) {
      return errorResponse(
        res,
        400,
        "Invalid expense ID."
      );
    }

    const expense =
      await Expense.findOne({
        _id: id,
        ...scope,
      });

    if (!expense) {
      return errorResponse(
        res,
        404,
        "Expense not found."
      );
    }

    if (
      expense.status !==
      "cancelled"
    ) {
      return errorResponse(
        res,
        400,
        "Only cancelled expenses can be restored."
      );
    }

    expense.status = "paid";

    expense.updatedBy =
      req.user._id;

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

// ======================================================
// DELETE EXPENSE
// ======================================================
//
// Accounting history should normally be preserved.
//
// Therefore this endpoint performs a soft delete
// by changing status to cancelled.
// ======================================================

export const deleteExpense = async (
  req,
  res,
  next
) => {
  try {
    const scope =
      await getExpenseScope(req);

    const { id } = req.params;

    if (!isValidObjectId(id)) {
      return errorResponse(
        res,
        400,
        "Invalid expense ID."
      );
    }

    const expense =
      await Expense.findOne({
        _id: id,
        ...scope,
      });

    if (!expense) {
      return errorResponse(
        res,
        404,
        "Expense not found."
      );
    }

    if (
      expense.status ===
      "cancelled"
    ) {
      return errorResponse(
        res,
        400,
        "Expense is already cancelled."
      );
    }

    // Keep accounting history.
    expense.status =
      "cancelled";

    expense.updatedBy =
      req.user._id;

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