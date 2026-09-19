import mongoose from "mongoose";

const salePaymentSchema = new mongoose.Schema(
  {
    tenantOwner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    business: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Business",
      required: true,
      index: true,
    },

    businessType: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "BusinessType",
      required: true,
      index: true,
    },

    sale: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Sale",
      required: true,
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
      required: true,
      trim: true,
    },

    amount: {
      type: Number,
      required: true,
      min: 0.01,
    },

    currency: {
      type: String,
      required: true,
      uppercase: true,
      trim: true,
      default: "USD",
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
      required: true,
    },

    gateway: {
      type: String,
      enum: [
        null,
        "paypal",
        "easypaisa",
        "jazzcash",
        "stripe",
        "other",
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
      ],
      default: "pending",
      index: true,
    },

    transactionId: {
      type: String,
      trim: true,
      default: null,
    },

    referenceNumber: {
      type: String,
      trim: true,
      default: null,
    },

    gatewayOrderId: {
      type: String,
      trim: true,
      default: null,
      index: true,
    },

    gatewayPaymentId: {
      type: String,
      trim: true,
      default: null,
    },

    gatewayStatus: {
      type: String,
      trim: true,
      default: null,
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
  {
    timestamps: true,
  }
);

salePaymentSchema.index(
  {
    tenantOwner: 1,
    business: 1,
    businessType: 1,
    paymentNumber: 1,
  },
  {
    unique: true,
  }
);

salePaymentSchema.index({
  tenantOwner: 1,
  business: 1,
  businessType: 1,
  sale: 1,
});

salePaymentSchema.index({
  tenantOwner: 1,
  business: 1,
  businessType: 1,
  customer: 1,
});

salePaymentSchema.index({
  tenantOwner: 1,
  business: 1,
  businessType: 1,
  status: 1,
});

salePaymentSchema.index({
  gateway: 1,
  gatewayOrderId: 1,
});

const SalePayment = mongoose.model(
  "SalePayment",
  salePaymentSchema
);

export default SalePayment;