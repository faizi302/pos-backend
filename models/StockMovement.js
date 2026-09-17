import mongoose from "mongoose";

const stockMovementSchema = new mongoose.Schema(
  {
    business: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Business",
      required: true,
      index: true,
    },

    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
      index: true,
    },

    productInventory: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ProductInventory",
      required: true,
      index: true,
    },

    movementType: {
      type: String,
      enum: ["in", "out", "adjustment"],
      required: true,
      index: true,
    },

    adjustmentType: {
      type: String,
      enum: ["increase", "decrease"],
      default: null,
    },

    quantity: {
      type: Number,
      required: true,
      min: 0.001,
    },

    previousQuantity: {
      type: Number,
      required: true,
      min: 0,
    },

    newQuantity: {
      type: Number,
      required: true,
      min: 0,
    },

    referenceType: {
      type: String,
      enum: [
        "purchase",
        "sale",
        "purchase_return",
        "sale_return",
        "opening_stock",
        "adjustment",
      ],
      required: true,
      index: true,
    },

    referenceId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },

    purchase: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Purchase",
      default: null,
      index: true,
    },

    purchaseItem: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "PurchaseItem",
      default: null,
      index: true,
    },

    sale: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Sale",
      default: null,
      index: true,
    },

    saleItem: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SaleItem",
      default: null,
      index: true,
    },

    reason: {
      type: String,
      trim: true,
      maxlength: 300,
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
      index: true,
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

stockMovementSchema.index({
  business: 1,
  product: 1,
  createdAt: -1,
});

stockMovementSchema.index({
  business: 1,
  productInventory: 1,
  createdAt: -1,
});

stockMovementSchema.index({
  business: 1,
  referenceType: 1,
  createdAt: -1,
});

stockMovementSchema.index({
  business: 1,
  movementType: 1,
  createdAt: -1,
});

const StockMovement = mongoose.model(
  "StockMovement",
  stockMovementSchema
);

export default StockMovement;