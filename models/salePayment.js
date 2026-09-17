import mongoose from "mongoose";

const salePaymentSchema = new mongoose.Schema(
  {
    business: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Business",
      required: [true, "Business is required."],
      index: true,
    },

    sale: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Sale",
      required: [true, "Sale is required."],
      index: true,
    },

    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Customer",
      default: null,
      index: true,
    },

    paymentNumber: {
      type: String,
      required: [true, "Payment number is required."],
      trim: true,
      uppercase: true,
    },

    amount: {
      type: Number,
      required: [true, "Payment amount is required."],
      min: [0, "Payment amount cannot be negative."],
    },

    currency: {
      type: String,
      required: [true, "Currency is required."],
      uppercase: true,
      trim: true,
      default: "USD",
      minlength: 3,
      maxlength: 3,
    },

    paymentMethod: {
      type: String,
      enum: [
        "cash",
        "bank",
        "card",
        "cheque",
        "online",
        "credit",
        "other",
      ],
      required: [true, "Payment method is required."],
    },

    gateway: {
      type: String,
      enum: [
        "paypal",
        "easypaisa",
        "jazzcash",
        "stripe",
        "other",
        null,
      ],
      default: null,
    },

    status: {
      type: String,
      enum: [
        "pending",
        "completed",
        "failed",
        "cancelled",
        "refunded",
      ],
      default: "pending",
      index: true,
    },

    referenceNumber: {
      type: String,
      trim: true,
      default: "",
    },

    transactionId: {
      type: String,
      trim: true,
      default: "",
      index: true,
    },

    gatewayOrderId: {
      type: String,
      trim: true,
      default: "",
      index: true,
    },

    gatewayPaymentId: {
      type: String,
      trim: true,
      default: "",
      index: true,
    },

    gatewayStatus: {
      type: String,
      trim: true,
      default: "",
    },

    gatewayResponse: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },

    paymentDate: {
      type: Date,
      default: null,
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
      required: true,
    },

    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  { timestamps: true }
);

salePaymentSchema.index(
  { business: 1, paymentNumber: 1 },
  { unique: true }
);

salePaymentSchema.index({
  business: 1,
  sale: 1,
  status: 1,
});

salePaymentSchema.index({
  business: 1,
  gatewayOrderId: 1,
});

salePaymentSchema.index({
  business: 1,
  gatewayPaymentId: 1,
});

const SalePayment = mongoose.model("SalePayment", salePaymentSchema);

export default SalePayment;