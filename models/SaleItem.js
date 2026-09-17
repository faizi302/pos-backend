import mongoose from "mongoose";

const saleItemSchema = new mongoose.Schema(
  {
    business: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Business",
      required: true,
      index: true,
    },

    sale: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Sale",
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

    quantity: {
      type: Number,
      required: true,
      min: 0.001,
    },

    salePrice: {
      type: Number,
      required: true,
      min: 0,
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

    lineSubtotal: {
      type: Number,
      min: 0,
      default: 0,
    },

    lineTotal: {
      type: Number,
      min: 0,
      default: 0,
    },

    returnedQuantity: {
      type: Number,
      min: 0,
      default: 0,
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
 * Same inventory variant should not appear twice
 * inside the same sale.
 */
saleItemSchema.index(
  {
    sale: 1,
    productInventory: 1,
  },
  {
    unique: true,
  }
);

saleItemSchema.index({
  business: 1,
  sale: 1,
});

saleItemSchema.index({
  business: 1,
  product: 1,
});

saleItemSchema.index({
  business: 1,
  productInventory: 1,
});

const SaleItem = mongoose.model("SaleItem", saleItemSchema);

export default SaleItem;