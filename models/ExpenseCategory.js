import mongoose from "mongoose";

const expenseCategorySchema = new mongoose.Schema(
  {
    // ==================================================
    // TENANT / BUSINESS
    // ==================================================

    // REAL tenant isolation field.
    //
    // Admin A -> tenantOwner = Admin A
    // Admin B -> tenantOwner = Admin B
    //
    // Both tenants can have:
    // business = same business
    // name = "Rent"
    //
    // because tenantOwner is different.
    tenantOwner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Tenant owner is required."],
      index: true,
    },

    // Business classification.
    //
    // This is not the primary security boundary.
    business: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Business",
      required: [true, "Business is required."],
      index: true,
    },

    // ==================================================
    // CATEGORY
    // ==================================================

    name: {
      type: String,
      required: [true, "Expense category name is required."],
      trim: true,
      maxlength: 100,
    },

    slug: {
      type: String,
      trim: true,
      lowercase: true,
      maxlength: 120,
    },

    description: {
      type: String,
      trim: true,
      maxlength: 500,
      default: "",
    },

    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },

    // ==================================================
    // AUDIT
    // ==================================================

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Created by is required."],
    },

    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// ======================================================
// UNIQUE CATEGORY NAME PER TENANT
// ======================================================
//
// Admin A:
// tenantOwner = A
// name = Rent
//
// Admin B:
// tenantOwner = B
// name = Rent
//
// Both are allowed.
//
// Same tenant + same category name = NOT allowed.
//
// ======================================================

expenseCategorySchema.index(
  {
    tenantOwner: 1,
    name: 1,
  },
  {
    unique: true,
    name: "tenantOwner_1_name_1",
  }
);

// ======================================================
// ACTIVE CATEGORY QUERIES
// ======================================================

expenseCategorySchema.index({
  tenantOwner: 1,
  isActive: 1,
});

// ======================================================
// BUSINESS CATEGORY QUERIES
// ======================================================

expenseCategorySchema.index({
  tenantOwner: 1,
  business: 1,
});

// ======================================================
// BUSINESS + ACTIVE CATEGORY QUERIES
// ======================================================

expenseCategorySchema.index({
  tenantOwner: 1,
  business: 1,
  isActive: 1,
});

const ExpenseCategory =
  mongoose.model(
    "ExpenseCategory",
    expenseCategorySchema
  );

export default ExpenseCategory;