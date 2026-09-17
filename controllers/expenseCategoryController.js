import mongoose from "mongoose";

import ExpenseCategory from "../models/ExpenseCategory.js";
import Business from "../models/Business.js";

import {
  successResponse,
  errorResponse,
} from "../utils/apiResponse.js";

const getBusinessId = (req) => {
  // SuperAdmin can select a business
  if (req.user.role?.slug === "super-admin") {
    return req.body.business || req.query.business || null;
  }

  // Admin / Manager always use their own business
  return req.user.business?._id || req.user.business || null;
};

const createSlug = (name) => {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
};

// --------------------------------------------------
// CREATE EXPENSE CATEGORY
// --------------------------------------------------

export const createExpenseCategory = async (req, res, next) => {
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

    const { name, description, isActive } = req.body;

    const slug = req.body.slug || createSlug(name);

    const existingCategory = await ExpenseCategory.findOne({
      business: businessId,
      name,
    });

    if (existingCategory) {
      return errorResponse(
        res,
        409,
        "Expense category with this name already exists."
      );
    }

    const category = await ExpenseCategory.create({
      business: businessId,
      name,
      slug,
      description,
      isActive,
      createdBy: req.user._id,
    });

    return successResponse(
      res,
      201,
      "Expense category created successfully.",
      category
    );
  } catch (error) {
    next(error);
  }
};

// --------------------------------------------------
// GET ALL EXPENSE CATEGORIES
// --------------------------------------------------

export const getAllExpenseCategories = async (req, res, next) => {
  try {
    const businessId = getBusinessId(req);

    if (!businessId) {
      return errorResponse(
        res,
        400,
        "Business is required."
      );
    }

    const {
      page = 1,
      limit = 20,
      search = "",
      isActive,
    } = req.query;

    const currentPage = Math.max(Number(page), 1);
    const currentLimit = Math.min(
      Math.max(Number(limit), 1),
      100
    );

    const skip = (currentPage - 1) * currentLimit;

    const filter = {
      business: businessId,
    };

    if (search.trim()) {
      filter.$or = [
        {
          name: {
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

    if (isActive !== undefined) {
      filter.isActive = isActive === "true";
    }

    const [categories, total] = await Promise.all([
      ExpenseCategory.find(filter)
        .populate("createdBy", "name email")
        .populate("updatedBy", "name email")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(currentLimit),

      ExpenseCategory.countDocuments(filter),
    ]);

    return successResponse(
      res,
      200,
      "Expense categories fetched successfully.",
      {
        categories,
        pagination: {
          total,
          page: currentPage,
          limit: currentLimit,
          totalPages: Math.ceil(total / currentLimit),
        },
      }
    );
  } catch (error) {
    next(error);
  }
};

// --------------------------------------------------
// GET SINGLE EXPENSE CATEGORY
// --------------------------------------------------

export const getExpenseCategoryById = async (
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

    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return errorResponse(
        res,
        400,
        "Invalid expense category ID."
      );
    }

    const category = await ExpenseCategory.findOne({
      _id: id,
      business: businessId,
    })
      .populate("createdBy", "name email")
      .populate("updatedBy", "name email");

    if (!category) {
      return errorResponse(
        res,
        404,
        "Expense category not found."
      );
    }

    return successResponse(
      res,
      200,
      "Expense category fetched successfully.",
      category
    );
  } catch (error) {
    next(error);
  }
};

// --------------------------------------------------
// UPDATE EXPENSE CATEGORY
// --------------------------------------------------

export const updateExpenseCategory = async (
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

    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return errorResponse(
        res,
        400,
        "Invalid expense category ID."
      );
    }

    const category = await ExpenseCategory.findOne({
      _id: id,
      business: businessId,
    });

    if (!category) {
      return errorResponse(
        res,
        404,
        "Expense category not found."
      );
    }

    const { name, description, isActive } = req.body;

    if (name && name !== category.name) {
      const duplicate = await ExpenseCategory.findOne({
        business: businessId,
        name,
        _id: { $ne: id },
      });

      if (duplicate) {
        return errorResponse(
          res,
          409,
          "Another expense category with this name already exists."
        );
      }

      category.name = name;

      // Automatically regenerate slug
      category.slug =
        req.body.slug || createSlug(name);
    }

    if (req.body.slug !== undefined) {
      category.slug = req.body.slug;
    }

    if (description !== undefined) {
      category.description = description;
    }

    if (isActive !== undefined) {
      category.isActive = isActive;
    }

    category.updatedBy = req.user._id;

    await category.save();

    return successResponse(
      res,
      200,
      "Expense category updated successfully.",
      category
    );
  } catch (error) {
    next(error);
  }
};

// --------------------------------------------------
// DELETE EXPENSE CATEGORY
// --------------------------------------------------

export const deleteExpenseCategory = async (
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

    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return errorResponse(
        res,
        400,
        "Invalid expense category ID."
      );
    }

    const category = await ExpenseCategory.findOne({
      _id: id,
      business: businessId,
    });

    if (!category) {
      return errorResponse(
        res,
        404,
        "Expense category not found."
      );
    }

    // Soft delete
    category.isActive = false;
    category.updatedBy = req.user._id;

    await category.save();

    return successResponse(
      res,
      200,
      "Expense category deleted successfully.",
      category
    );
  } catch (error) {
    next(error);
  }
};

// --------------------------------------------------
// RESTORE EXPENSE CATEGORY
// --------------------------------------------------

export const restoreExpenseCategory = async (
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

    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return errorResponse(
        res,
        400,
        "Invalid expense category ID."
      );
    }

    const category = await ExpenseCategory.findOne({
      _id: id,
      business: businessId,
    });

    if (!category) {
      return errorResponse(
        res,
        404,
        "Expense category not found."
      );
    }

    category.isActive = true;
    category.updatedBy = req.user._id;

    await category.save();

    return successResponse(
      res,
      200,
      "Expense category restored successfully.",
      category
    );
  } catch (error) {
    next(error);
  }
};