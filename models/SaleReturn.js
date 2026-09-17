import mongoose from "mongoose";

const saleReturnSchema = new mongoose.Schema(
  {
    // --------------------------------------------------
    // BUSINESS / TENANT
    // --------------------------------------------------

    business: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Business",
      required: [true, "Business is required."],
      index: true,
    },

    // --------------------------------------------------
    // ORIGINAL SALE
    // --------------------------------------------------

    sale: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Sale",
      required: [true, "Sale is required."],
      index: true,
    },

    // --------------------------------------------------
    // CUSTOMER
    // --------------------------------------------------

    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Customer",
      default: null,
      index: true,
    },

    // --------------------------------------------------
    // RETURN NUMBER
    // --------------------------------------------------

    returnNumber: {
      type: String,
      required: [true, "Return number is required."],
      trim: true,
      uppercase: true,
    },

    // --------------------------------------------------
    // RETURN DATE
    // --------------------------------------------------

    returnDate: {
      type: Date,
      required: true,
      default: Date.now,
      index: true,
    },

    // --------------------------------------------------
    // RETURN STATUS
    // --------------------------------------------------

    status: {
      type: String,
      enum: [
        "draft",
        "completed",
        "cancelled",
      ],
      default: "draft",
      index: true,
    },

    // --------------------------------------------------
    // REFUND STATUS
    // --------------------------------------------------

    refundStatus: {
      type: String,
      enum: [
        "not_refunded",
        "pending",
        "partially_refunded",
        "refunded",
        "customer_credit",
      ],
      default: "not_refunded",
      index: true,
    },

    // --------------------------------------------------
    // RETURN TOTALS
    // --------------------------------------------------

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

    totalAmount: {
      type: Number,
      min: 0,
      default: 0,
    },

    refundAmount: {
      type: Number,
      min: 0,
      default: 0,
    },

    // --------------------------------------------------
    // RETURN REASON
    // --------------------------------------------------

    reason: {
      type: String,
      trim: true,
      maxlength: 500,
      default: "",
    },

    // --------------------------------------------------
    // NOTES
    // --------------------------------------------------

    notes: {
      type: String,
      trim: true,
      maxlength: 1000,
      default: "",
    },

    // --------------------------------------------------
    // AUDIT
    // --------------------------------------------------

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


// ==================================================
// INDEXES
// ==================================================

// Return number unique inside each business
saleReturnSchema.index(
  {
    business: 1,
    returnNumber: 1,
  },
  {
    unique: true,
  }
);

// Returns for a specific sale
saleReturnSchema.index({
  business: 1,
  sale: 1,
  returnDate: -1,
});

// Customer return history
saleReturnSchema.index({
  business: 1,
  customer: 1,
  returnDate: -1,
});

// Status filtering
saleReturnSchema.index({
  business: 1,
  status: 1,
});

// Refund status filtering
saleReturnSchema.index({
  business: 1,
  refundStatus: 1,
});

// Date-based reports
saleReturnSchema.index({
  business: 1,
  returnDate: -1,
});


const SaleReturn = mongoose.model(
  "SaleReturn",
  saleReturnSchema
);

export default SaleReturn;