import mongoose from "mongoose";

const purchaseSchema = new mongoose.Schema(
  {
    business: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Business",
      required: true,
      index: true,
    },

    supplier: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Supplier",
      required: true,
      index: true,
    },

    purchaseNumber: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
    },

    purchaseDate: {
      type: Date,
      required: true,
      default: Date.now,
    },

    dueDate: {
      type: Date,
      default: null,
    },

    status: {
      type: String,
      enum: [
        "draft",
        "received",
        "partially_received",
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
 * Purchase number must be unique inside
 * each business, not globally.
 */
purchaseSchema.index(
  {
    business: 1,
    purchaseNumber: 1,
  },
  {
    unique: true,
  }
);

purchaseSchema.index({
  business: 1,
  supplier: 1,
  purchaseDate: -1,
});

purchaseSchema.index({
  business: 1,
  status: 1,
});

purchaseSchema.index({
  business: 1,
  paymentStatus: 1,
});

purchaseSchema.index({
  business: 1,
  purchaseDate: -1,
});

const Purchase = mongoose.model(
  "Purchase",
  purchaseSchema
);

export default Purchase;