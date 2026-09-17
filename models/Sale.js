import mongoose from "mongoose";

const saleSchema = new mongoose.Schema(
  {
    business: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Business",
      required: true,
      index: true,
    },

    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Customer",
      default: null,
      index: true,
    },

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
      default: "",
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
  {
    timestamps: true,
  }
);

/*
|--------------------------------------------------------------------------
| Indexes
|--------------------------------------------------------------------------
*/

saleSchema.index(
  {
    business: 1,
    saleNumber: 1,
  },
  {
    unique: true,
  }
);

saleSchema.index({
  business: 1,
  customer: 1,
  saleDate: -1,
});

saleSchema.index({
  business: 1,
  status: 1,
});

saleSchema.index({
  business: 1,
  paymentStatus: 1,
});

saleSchema.index({
  business: 1,
  saleDate: -1,
});

const Sale = mongoose.model(
  "Sale",
  saleSchema
);

export default Sale;