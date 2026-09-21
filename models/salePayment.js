import mongoose from "mongoose";

const salePaymentSchema = new mongoose.Schema(
  {
    // =====================================================
    // TENANT
    // =====================================================

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

    // =====================================================
    // SALE
    // =====================================================

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

    // =====================================================
    // PAYMENT IDENTIFICATION
    // =====================================================

    paymentNumber: {
      type: String,
      required: true,
      trim: true,
    },

    // =====================================================
    // LOCAL POS ACCOUNTING
    // =====================================================
    // IMPORTANT:
    // This amount is ALWAYS the amount applied to the Sale.
    //
    // Your Sale accounting remains PKR.
    //
    // Example:
    // Sale = PKR 25,000
    //
    // PayPal may receive USD 89.29
    // but this field remains:
    //
    // amount = 25,000
    // currency = PKR
    // =====================================================

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
      default: "PKR",
    },

    // =====================================================
    // GATEWAY AMOUNT
    // =====================================================
    // The actual amount sent to the payment gateway.
    //
    // PayPal:
    // gatewayAmount = 89.29
    // gatewayCurrency = USD
    //
    // Easypaisa/JazzCash:
    // gatewayAmount = 25000
    // gatewayCurrency = PKR
    // =====================================================

    gatewayAmount: {
      type: Number,
      default: null,
      min: 0,
    },

    gatewayCurrency: {
      type: String,
      uppercase: true,
      trim: true,
      default: null,
    },

    // =====================================================
    // EXCHANGE RATE
    // =====================================================
    // Used when local currency and gateway currency differ.
    //
    // Example:
    // PKR -> USD
    // 1 PKR = 0.00357143 USD
    //
    // For PKR -> PKR gateways this remains null.
    // =====================================================

    exchangeRate: {
      type: Number,
      default: null,
      min: 0,
    },

    // =====================================================
    // PAYMENT METHOD
    // =====================================================

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

    // =====================================================
    // PAYMENT GATEWAY
    // =====================================================

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

    // =====================================================
    // PAYMENT STATUS
    // =====================================================

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

    // =====================================================
    // TRANSACTION INFORMATION
    // =====================================================

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

    // =====================================================
    // DATES
    // =====================================================

    paymentDate: {
      type: Date,
      default: null,
    },

    // =====================================================
    // NOTES
    // =====================================================

    notes: {
      type: String,
      trim: true,
      default: "",
    },

    // =====================================================
    // AUDIT
    // =====================================================

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

// =====================================================
// INDEXES
// =====================================================

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