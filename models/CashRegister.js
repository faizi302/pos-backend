import mongoose from "mongoose";

const cashRegisterSchema = new mongoose.Schema(
  {
    business: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Business",
      required: [true, "Business is required."],
      index: true,
    },

    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Cash register user is required."],
      index: true,
    },

    registerNumber: {
      type: String,
      required: [true, "Register number is required."],
      trim: true,
      uppercase: true,
    },

    openedAt: {
      type: Date,
      required: [true, "Opening time is required."],
      default: Date.now,
      index: true,
    },

    closedAt: {
      type: Date,
      default: null,
    },

    status: {
      type: String,
      enum: ["open", "closed"],
      default: "open",
      index: true,
    },

    // Cash physically available when register opens
    openingBalance: {
      type: Number,
      required: [true, "Opening balance is required."],
      min: [0, "Opening balance cannot be negative."],
      default: 0,
    },

    // Cash received through customer SalePayments
    cashSales: {
      type: Number,
      min: [0, "Cash sales cannot be negative."],
      default: 0,
    },

    // Cash paid for business expenses
    cashExpenses: {
      type: Number,
      min: [0, "Cash expenses cannot be negative."],
      default: 0,
    },

    // Cash returned to customers
    cashRefunds: {
      type: Number,
      min: [0, "Cash refunds cannot be negative."],
      default: 0,
    },

    // Extra cash manually added
    cashIn: {
      type: Number,
      min: [0, "Cash in cannot be negative."],
      default: 0,
    },

    // Cash manually removed
    cashOut: {
      type: Number,
      min: [0, "Cash out cannot be negative."],
      default: 0,
    },

    // Backend calculated value
    expectedClosingBalance: {
      type: Number,
      min: 0,
      default: 0,
    },

    // Physical cash counted by cashier
    actualClosingBalance: {
      type: Number,
      min: 0,
      default: null,
    },

    // actualClosingBalance - expectedClosingBalance
    difference: {
      type: Number,
      default: null,
    },

    notes: {
      type: String,
      trim: true,
      maxlength: 1000,
      default: "",
    },

    openedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Opened by is required."],
    },

    closedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

cashRegisterSchema.index(
  { business: 1, registerNumber: 1 },
  { unique: true }
);

cashRegisterSchema.index({
  business: 1,
  status: 1,
  openedAt: -1,
});

cashRegisterSchema.index({
  business: 1,
  user: 1,
  openedAt: -1,
});

const CashRegister = mongoose.model(
  "CashRegister",
  cashRegisterSchema
);

export default CashRegister;