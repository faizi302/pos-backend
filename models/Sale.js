
import mongoose from "mongoose";

const saleSchema = new mongoose.Schema(
  {
    // ==================================================
    // TENANT / BUSINESS
    // ==================================================

    // The Admin account that owns this sale.
    //
    // This is the REAL tenant isolation field.
    //
    // Admin A and Admin B can both have:
    // IT + Mobiles + Sale #INV-001
    //
    // because their tenantOwner is different.
    tenantOwner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    // Business classification.
    // This is NOT the tenant security boundary.
    business: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Business",
      required: true,
      index: true,
    },

    // Business type classification.
    businessType: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "BusinessType",
      required: true,
      index: true,
    },

    // ==================================================
    // CUSTOMER
    // ==================================================

    // Customer is optional.
    //
    // Walk-in customer:
    // customer = null
    //
    // Registered customer:
    // customer = Customer._id
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Customer",
      default: null,
      index: true,
    },

    // ==================================================
    // SALE INFORMATION
    // ==================================================

    saleNumber: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
    },

    saleDate: {
      type: Date,
      required: true,
      default: Date.now,
      index: true,
    },

    // ==================================================
    // SALE STATUS
    // ==================================================

    status: {
      type: String,
      enum: [
        "draft",
        "completed",
        "partially_returned",
        "returned",
        "cancelled",
      ],
      default: "draft",
      index: true,
    },

    // ==================================================
    // PAYMENT STATUS
    // ==================================================

    paymentStatus: {
      type: String,
      enum: [
        "unpaid",
        "partially_paid",
        "paid",
        "refunded",
      ],
      default: "unpaid",
      index: true,
    },

    // ==================================================
    // AMOUNTS
    // ==================================================

    subtotal: {
      type: Number,
      min: 0,
      default: 0,
    },

    discount: {
      type: Number,
      min: 0,
      default: 0,
    },

    tax: {
      type: Number,
      min: 0,
      default: 0,
    },

    shippingCost: {
      type: Number,
      min: 0,
      default: 0,
    },

    otherCharges: {
      type: Number,
      min: 0,
      default: 0,
    },

    totalAmount: {
      type: Number,
      min: 0,
      default: 0,
    },

    paidAmount: {
      type: Number,
      min: 0,
      default: 0,
    },

    dueAmount: {
      type: Number,
      min: 0,
      default: 0,
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
        "credit",
        "other",
      ],
      default: "cash",
    },

    referenceNumber: {
      type: String,
      trim: true,
      default: null,
    },

    // ==================================================
    // NOTES
    // ==================================================

    // notes: {
    //   type: String,
    //   trim: true,
    //   maxlength: 1000,
    //   default: null,
    // },

    // ==================================================
    // AUDIT
    // ==================================================

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

// ======================================================
// INDEXES
// ======================================================

// Sale number is unique INSIDE the same tenant.
//
// Admin A:
// tenantOwner = Admin A
// saleNumber = INV-001
//
// Admin B:
// tenantOwner = Admin B
// saleNumber = INV-001
//
// Both are allowed.
saleSchema.index(
  {
    tenantOwner: 1,
    saleNumber: 1,
  },
  {
    unique: true,
  }
);

// Customer sales inside a tenant.
saleSchema.index({
  tenantOwner: 1,
  customer: 1,
  saleDate: -1,
});

// Business + business type sales.
saleSchema.index({
  tenantOwner: 1,
  business: 1,
  businessType: 1,
  saleDate: -1,
});

// Sales by status inside a tenant.
saleSchema.index({
  tenantOwner: 1,
  status: 1,
});

// Sales by payment status inside a tenant.
saleSchema.index({
  tenantOwner: 1,
  paymentStatus: 1,
});

// Sales by date inside a tenant.
saleSchema.index({
  tenantOwner: 1,
  saleDate: -1,
});

const Sale = mongoose.model(
  "Sale",
  saleSchema
);

export default Sale;
