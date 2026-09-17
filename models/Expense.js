import mongoose from "mongoose";

const expenseSchema = new mongoose.Schema(
  {
    business: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Business",
      required: [true, "Business is required."],
      index: true,
    },

    expenseCategory: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ExpenseCategory",
      required: [true, "Expense category is required."],
      index: true,
    },

    expenseNumber: {
      type: String,
      required: [true, "Expense number is required."],
      trim: true,
      uppercase: true,
    },

    expenseDate: {
      type: Date,
      required: [true, "Expense date is required."],
      default: Date.now,
      index: true,
    },

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

    amount: {
      type: Number,
      required: [true, "Expense amount is required."],
      min: [0, "Expense amount cannot be negative."],
    },

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

    status: {
      type: String,
      enum: ["draft", "paid", "cancelled"],
      default: "paid",
      index: true,
    },

    notes: {
      type: String,
      trim: true,
      maxlength: 1000,
      default: "",
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

// Unique expense number inside a business
expenseSchema.index(
  { business: 1, expenseNumber: 1 },
  { unique: true }
);

// Category + date reporting
expenseSchema.index({
  business: 1,
  expenseCategory: 1,
  expenseDate: -1,
});

// Payment method reporting
expenseSchema.index({
  business: 1,
  paymentMethod: 1,
  expenseDate: -1,
});

// Status filtering
expenseSchema.index({
  business: 1,
  status: 1,
  expenseDate: -1,
});

// General date filtering
expenseSchema.index({
  business: 1,
  expenseDate: -1,
});

const Expense = mongoose.model("Expense", expenseSchema);

export default Expense;