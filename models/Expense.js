import mongoose from "mongoose";

const expenseSchema = new mongoose.Schema(
  {
    // ==================================================
    // TENANT / BUSINESS
    // ==================================================

    // REAL tenant isolation field.
    //
    // Admin A -> tenantOwner = Admin A
    // Admin B -> tenantOwner = Admin B
    //
    // Both tenants can have the same:
    // Business
    // Expense Number
    // Expense Category
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
    // This is NOT the main security boundary.
    business: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Business",
      required: [true, "Business is required."],
      index: true,
    },

    // ==================================================
    // EXPENSE CATEGORY
    // ==================================================

    expenseCategory: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ExpenseCategory",
      required: [true, "Expense category is required."],
      index: true,
    },

    // ==================================================
    // EXPENSE NUMBER
    // ==================================================

    expenseNumber: {
      type: String,
      required: [true, "Expense number is required."],
      trim: true,
      uppercase: true,
    },

    // ==================================================
    // EXPENSE DATE
    // ==================================================

    expenseDate: {
      type: Date,
      required: [true, "Expense date is required."],
      default: Date.now,
      index: true,
    },

    // ==================================================
    // BASIC INFORMATION
    // ==================================================

    title: {
      type: String,
      required: [true, "Expense title is required."],
      trim: true,
      maxlength: 200,
    },

    description: {
      type: String,
      trim: true,
      maxlength: 1000,
      default: "",
    },

    // ==================================================
    // AMOUNT
    // ==================================================

    amount: {
      type: Number,
      required: [true, "Expense amount is required."],
      min: [0, "Expense amount cannot be negative."],
    },

    // ==================================================
    // PAYMENT
    // ==================================================

    paymentMethod: {
      type: String,
      enum: [
        "cash",
        "bank",
        "card",
        "cheque",
        "online",
        "other",
      ],
      default: "cash",
      index: true,
    },

    referenceNumber: {
      type: String,
      trim: true,
      maxlength: 100,
      default: "",
    },

    // ==================================================
    // RECEIPT
    // ==================================================

    receipt: {
      url: {
        type: String,
        default: null,
      },

      publicId: {
        type: String,
        default: null,
      },

      assetId: {
        type: String,
        default: null,
      },
    },

    // ==================================================
    // STATUS
    // ==================================================

    status: {
      type: String,
      enum: ["draft", "paid", "cancelled"],
      default: "paid",
      index: true,
    },

    // ==================================================
    // NOTES
    // ==================================================

    notes: {
      type: String,
      trim: true,
      maxlength: 1000,
      default: "",
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
// UNIQUE EXPENSE NUMBER PER TENANT
// ======================================================
//
// Admin A:
// tenantOwner = A
// expenseNumber = EXP-000001
//
// Admin B:
// tenantOwner = B
// expenseNumber = EXP-000001
//
// Both are allowed.
//
// Same tenant + same expense number = NOT allowed.
//
// ======================================================

expenseSchema.index(
  {
    tenantOwner: 1,
    expenseNumber: 1,
  },
  {
    unique: true,
    name: "tenantOwner_1_expenseNumber_1",
  }
);

// ======================================================
// CATEGORY + DATE REPORTING
// ======================================================

expenseSchema.index({
  tenantOwner: 1,
  expenseCategory: 1,
  expenseDate: -1,
});

// ======================================================
// PAYMENT METHOD REPORTING
// ======================================================

expenseSchema.index({
  tenantOwner: 1,
  paymentMethod: 1,
  expenseDate: -1,
});

// ======================================================
// STATUS FILTERING
// ======================================================

expenseSchema.index({
  tenantOwner: 1,
  status: 1,
  expenseDate: -1,
});

// ======================================================
// BUSINESS REPORTING
// ======================================================

expenseSchema.index({
  tenantOwner: 1,
  business: 1,
  expenseDate: -1,
});

// ======================================================
// GENERAL DATE FILTERING
// ======================================================

expenseSchema.index({
  tenantOwner: 1,
  expenseDate: -1,
});

const Expense = mongoose.model("Expense", expenseSchema);

export default Expense;