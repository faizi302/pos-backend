import mongoose from "mongoose";

import ExpenseCategory from "../models/ExpenseCategory.js";
import Business from "../models/Business.js";

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
// GET EXPENSE CATEGORY SCOPE
// ======================================================
//
// SUPER ADMIN
// → Can select tenantOwner + business.
//
// ADMIN
// → tenantOwner = Admin._id
// → business = Admin.business
//
// MANAGER
// → tenantOwner = Admin._id
// → business = Admin.business
//
// Admin / Manager values are never trusted from
// req.body or req.query.
//
// ======================================================

const getExpenseCategoryScope = async (
  req,
  options = {}
) => {
  const {
    requireCreateContext = false,
  } = options;

  const tenant =
    await getTenantContext(req);

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

    // --------------------------------------------------
    // CREATE
    // --------------------------------------------------

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
          new mongoose.Types.ObjectId(
            tenantOwner
          ),

        business:
          new mongoose.Types.ObjectId(
            business
          ),
      };
    }

    // --------------------------------------------------
    // READ / UPDATE / DELETE
    // --------------------------------------------------

    const scope = {};

    if (tenantOwner) {
      if (!isValidObjectId(tenantOwner)) {
        throw new Error(
          "Invalid tenant owner ID."
        );
      }

      scope.tenantOwner =
        new mongoose.Types.ObjectId(
          tenantOwner
        );
    }

    if (business) {
      if (!isValidObjectId(business)) {
        throw new Error(
          "Invalid business ID."
        );
      }

      scope.business =
        new mongoose.Types.ObjectId(
          business
        );
    }

    return scope;
  }

  // ====================================================
  // ADMIN / MANAGER
  // ====================================================

  const scope =
    buildTenantQuery(tenant);

  if (!tenant.business) {
    throw new Error(
      "Business is not assigned to this tenant."
    );
  }

  scope.business =
    tenant.business;

  return scope;
};

// ======================================================
// CREATE SLUG
// ======================================================

const createSlug = (name) => {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
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
// CREATE EXPENSE CATEGORY
// ======================================================

export const createExpenseCategory = async (
  req,
  res,
  next
) => {
  try {
    const scope =
      await getExpenseCategoryScope(
        req,
        {
          requireCreateContext: true,
        }
      );

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
    // GET DATA
    // ==================================================

    const {
      name,
      description,
      isActive,
    } = req.body;

    if (
      !name ||
      !name.trim()
    ) {
      return errorResponse(
        res,
        400,
        "Expense category name is required."
      );
    }

    const trimmedName =
      name.trim();

    const slug =
      req.body.slug !== undefined
        ? req.body.slug
        : createSlug(trimmedName);

    // ==================================================
    // DUPLICATE CHECK
    // ==================================================
    //
    // IMPORTANT:
    // Check tenantOwner, NOT only business.
    //
    // This allows:
    //
    // Tenant A -> Rent
    // Tenant B -> Rent
    //
    // but prevents:
    //
    // Tenant A -> Rent
    // Tenant A -> Rent
    //
    // ==================================================

    const existingCategory =
      await ExpenseCategory.findOne({
        tenantOwner:
          scope.tenantOwner,
        name: trimmedName,
      });

    if (existingCategory) {
      return errorResponse(
        res,
        409,
        "Expense category with this name already exists in this tenant."
      );
    }

    // ==================================================
    // CREATE
    // ==================================================

    const category =
      await ExpenseCategory.create({
        tenantOwner:
          scope.tenantOwner,

        business:
          scope.business,

        name:
          trimmedName,

        slug,

        description,

        isActive,

        createdBy:
          req.user._id,
      });

    // ==================================================
    // POPULATE
    // ==================================================

    const populatedCategory =
      await ExpenseCategory.findById(
        category._id
      )
        .populate(
          "business",
          "name"
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
      "Expense category created successfully.",
      populatedCategory
    );
  } catch (error) {
    // MongoDB unique index protection
    if (error?.code === 11000) {
      return errorResponse(
        res,
        409,
        "Expense category with this name already exists in this tenant."
      );
    }

    next(error);
  }
};

// ======================================================
// GET ALL EXPENSE CATEGORIES
// ======================================================

export const getAllExpenseCategories = async (
  req,
  res,
  next
) => {
  try {
    const scope =
      await getExpenseCategoryScope(req);

    const {
      page = 1,
      limit = 20,
      search = "",
      isActive,
    } = req.query;

    const currentPage =
      Math.max(
        Number(page) || 1,
        1
      );

    const currentLimit =
      Math.min(
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
        escapeRegex(
          search.trim()
        );

      filter.$or = [
        {
          name: {
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
        {
          slug: {
            $regex: safeSearch,
            $options: "i",
          },
        },
      ];
    }

    // ==================================================
    // ACTIVE FILTER
    // ==================================================

    if (
      isActive !== undefined
    ) {
      filter.isActive =
        isActive === "true";
    }

    // ==================================================
    // FETCH
    // ==================================================

    const [
      categories,
      total,
    ] = await Promise.all([
      ExpenseCategory.find(filter)
        .populate(
          "business",
          "name"
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
          createdAt: -1,
        })
        .skip(skip)
        .limit(currentLimit),

      ExpenseCategory.countDocuments(
        filter
      ),
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
// GET SINGLE EXPENSE CATEGORY
// ======================================================

export const getExpenseCategoryById = async (
  req,
  res,
  next
) => {
  try {
    const scope =
      await getExpenseCategoryScope(
        req
      );

    const { id } =
      req.params;

    if (!isValidObjectId(id)) {
      return errorResponse(
        res,
        400,
        "Invalid expense category ID."
      );
    }

    const category =
      await ExpenseCategory.findOne({
        _id: id,
        ...scope,
      })
        .populate(
          "business",
          "name"
        )
        .populate(
          "createdBy",
          "name email"
        )
        .populate(
          "updatedBy",
          "name email"
        );

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

// ======================================================
// UPDATE EXPENSE CATEGORY
// ======================================================

export const updateExpenseCategory = async (
  req,
  res,
  next
) => {
  try {
    const scope =
      await getExpenseCategoryScope(
        req
      );

    const { id } =
      req.params;

    if (!isValidObjectId(id)) {
      return errorResponse(
        res,
        400,
        "Invalid expense category ID."
      );
    }

    // ==================================================
    // FIND ONLY INSIDE TENANT
    // ==================================================

    const category =
      await ExpenseCategory.findOne({
        _id: id,
        ...scope,
      });

    if (!category) {
      return errorResponse(
        res,
        404,
        "Expense category not found."
      );
    }

    const {
      name,
      description,
      isActive,
    } = req.body;

    // ==================================================
    // NAME
    // ==================================================

    if (
      name !== undefined
    ) {
      const trimmedName =
        name.trim();

      if (!trimmedName) {
        return errorResponse(
          res,
          400,
          "Expense category name cannot be empty."
        );
      }

      if (
        trimmedName !==
        category.name
      ) {
        const duplicate =
          await ExpenseCategory.findOne({
            tenantOwner:
              scope.tenantOwner,

            name:
              trimmedName,

            _id: {
              $ne: id,
            },
          });

        if (duplicate) {
          return errorResponse(
            res,
            409,
            "Another expense category with this name already exists in this tenant."
          );
        }

        category.name =
          trimmedName;

        // Automatically regenerate
        // slug if custom slug was not sent.
        if (
          req.body.slug ===
          undefined
        ) {
          category.slug =
            createSlug(
              trimmedName
            );
        }
      }
    }

    // ==================================================
    // SLUG
    // ==================================================

    if (
      req.body.slug !==
      undefined
    ) {
      category.slug =
        req.body.slug;
    }

    // ==================================================
    // DESCRIPTION
    // ==================================================

    if (
      description !==
      undefined
    ) {
      category.description =
        description;
    }

    // ==================================================
    // ACTIVE STATUS
    // ==================================================

    if (
      isActive !==
      undefined
    ) {
      category.isActive =
        isActive;
    }

    // ==================================================
    // AUDIT
    // ==================================================

    category.updatedBy =
      req.user._id;

    // ==================================================
    // SAVE
    // ==================================================

    await category.save();

    // ==================================================
    // POPULATE
    // ==================================================

    const updatedCategory =
      await ExpenseCategory.findById(
        category._id
      )
        .populate(
          "business",
          "name"
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
      "Expense category updated successfully.",
      updatedCategory
    );
  } catch (error) {
    if (error?.code === 11000) {
      return errorResponse(
        res,
        409,
        "Expense category with this name already exists in this tenant."
      );
    }

    next(error);
  }
};

// ======================================================
// DELETE EXPENSE CATEGORY
// ======================================================
//
// Soft delete.
// Existing expenses remain valid.
// ======================================================

export const deleteExpenseCategory = async (
  req,
  res,
  next
) => {
  try {
    const scope =
      await getExpenseCategoryScope(
        req
      );

    const { id } =
      req.params;

    if (!isValidObjectId(id)) {
      return errorResponse(
        res,
        400,
        "Invalid expense category ID."
      );
    }

    const category =
      await ExpenseCategory.findOne({
        _id: id,
        ...scope,
      });

    if (!category) {
      return errorResponse(
        res,
        404,
        "Expense category not found."
      );
    }

    if (!category.isActive) {
      return errorResponse(
        res,
        400,
        "Expense category is already inactive."
      );
    }

    category.isActive =
      false;

    category.updatedBy =
      req.user._id;

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

// ======================================================
// RESTORE EXPENSE CATEGORY
// ======================================================

export const restoreExpenseCategory = async (
  req,
  res,
  next
) => {
  try {
    const scope =
      await getExpenseCategoryScope(
        req
      );

    const { id } =
      req.params;

    if (!isValidObjectId(id)) {
      return errorResponse(
        res,
        400,
        "Invalid expense category ID."
      );
    }

    const category =
      await ExpenseCategory.findOne({
        _id: id,
        ...scope,
      });

    if (!category) {
      return errorResponse(
        res,
        404,
        "Expense category not found."
      );
    }

    if (category.isActive) {
      return errorResponse(
        res,
        400,
        "Expense category is already active."
      );
    }

    category.isActive =
      true;

    category.updatedBy =
      req.user._id;

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