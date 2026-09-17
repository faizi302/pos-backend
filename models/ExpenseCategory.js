import mongoose from "mongoose";

const expenseCategorySchema = new mongoose.Schema(
  {
    business: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Business",
      required: [true, "Business is required."],
      index: true,
    },

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

// Same business cannot have duplicate expense category names
expenseCategorySchema.index(
  { business: 1, name: 1 },
  { unique: true }
);

// Useful for active-category queries
expenseCategorySchema.index({
  business: 1,
  isActive: 1,
});

const ExpenseCategory = mongoose.model(
  "ExpenseCategory",
  expenseCategorySchema
);

export default ExpenseCategory;