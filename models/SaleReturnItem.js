import mongoose from "mongoose";

const saleReturnItemSchema = new mongoose.Schema(
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
    // SALE RETURN
    // --------------------------------------------------

    saleReturn: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SaleReturn",
      required: [true, "Sale return is required."],
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
    // ORIGINAL SALE ITEM
    // --------------------------------------------------

    saleItem: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SaleItem",
      required: [true, "Sale item is required."],
      index: true,
    },

    // --------------------------------------------------
    // PRODUCT
    // --------------------------------------------------

    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: [true, "Product is required."],
      index: true,
    },

    // --------------------------------------------------
    // EXACT PRODUCT VARIANT
    // --------------------------------------------------

    productInventory: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ProductInventory",
      required: [true, "Product inventory is required."],
      index: true,
    },

    // --------------------------------------------------
    // RETURN QUANTITY
    // --------------------------------------------------

    quantity: {
      type: Number,
      required: [true, "Return quantity is required."],
      min: [0.001, "Return quantity must be greater than 0."],
    },

    // --------------------------------------------------
    // SALE PRICE SNAPSHOT
    // --------------------------------------------------

    salePrice: {
      type: Number,
      required: [true, "Sale price is required."],
      min: 0,
    },

    // --------------------------------------------------
    // DISCOUNT
    // --------------------------------------------------

    discount: {
      type: Number,
      min: 0,
      default: 0,
    },

    // --------------------------------------------------
    // TAX
    // --------------------------------------------------

    tax: {
      type: Number,
      min: 0,
      default: 0,
    },

    // --------------------------------------------------
    // LINE SUBTOTAL
    // --------------------------------------------------

    lineSubtotal: {
      type: Number,
      min: 0,
      default: 0,
    },

    // --------------------------------------------------
    // LINE TOTAL
    // --------------------------------------------------

    lineTotal: {
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

// Prevent the same SaleItem from being added twice
// to the same return.
saleReturnItemSchema.index(
  {
    saleReturn: 1,
    saleItem: 1,
  },
  {
    unique: true,
  }
);


// Useful tenant queries
saleReturnItemSchema.index({
  business: 1,
  saleReturn: 1,
});

saleReturnItemSchema.index({
  business: 1,
  sale: 1,
});

saleReturnItemSchema.index({
  business: 1,
  saleItem: 1,
});

saleReturnItemSchema.index({
  business: 1,
  product: 1,
});

saleReturnItemSchema.index({
  business: 1,
  productInventory: 1,
});


const SaleReturnItem = mongoose.model(
  "SaleReturnItem",
  saleReturnItemSchema
);

export default SaleReturnItem;