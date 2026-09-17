import mongoose from "mongoose";

const productInventorySchema = new mongoose.Schema(
  {
    // ==========================================
    // TENANT / BUSINESS
    // ==========================================
    // Every inventory belongs to exactly one business.
    // This is the main tenant-isolation field.
    business: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Business",
      required: true,
      index: true,
    },

    // ==========================================
    // PRODUCT
    // ==========================================
    // Inventory must belong to a product.
    //
    // IMPORTANT:
    // Controller must verify:
    // product.business === inventory.business
    //
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
      index: true,
    },

    // ==========================================
    // PRODUCT VARIANT
    // ==========================================
    // These fields are used when a product has variants.
    //
    // Example:
    // Samsung S20
    //   Black / 128GB
    //   Black / 256GB
    //   White / 128GB
    //
    color: {
      type: String,
      trim: true,
      default: null,
    },

    size: {
      type: String,
      trim: true,
      default: null,
    },

    // ==========================================
    // STOCK
    // ==========================================
    quantity: {
      type: Number,
      min: 0,
      default: 0,
    },

    minStock: {
      type: Number,
      min: 0,
      default: 0,
    },

    maxStock: {
      type: Number,
      min: 0,
      default: null,
    },

    // ==========================================
    // PRICING
    // ==========================================
    purchasePrice: {
      type: Number,
      min: 0,
      default: 0,
    },

    salePrice: {
      type: Number,
      min: 0,
      default: 0,
    },

    discount: {
      type: Number,
      min: 0,
      max: 100,
      default: 0,
    },

    tax: {
      type: Number,
      min: 0,
      default: 0,
    },

    // ==========================================
    // STATUS
    // ==========================================
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },

    // ==========================================
    // AUDIT
    // ==========================================
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
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
// UNIQUE INVENTORY VARIANT PER BUSINESS + PRODUCT
// ======================================================
//
// Business 1
//   Samsung S20
//      Black / 128GB
//      Black / 256GB
//
// Business 2
//   Samsung S20
//      Black / 128GB
//
// This is completely valid because the businesses are
// different tenants.
//
// But inside Business 1:
//
//   Samsung S20
//      Black / 128GB
//
// cannot exist twice while active.
//
// ======================================================
productInventorySchema.index(
  {
    business: 1,
    product: 1,
    color: 1,
    size: 1,
  },
  {
    unique: true,
    partialFilterExpression: {
      isActive: true,
    },
  }
);

// ======================================================
// BUSINESS + PRODUCT LOOKUP
// ======================================================
//
// Used for queries such as:
//
// Get inventories belonging to my business
// for a particular product.
//
productInventorySchema.index({
  business: 1,
  product: 1,
});

// ======================================================
// BUSINESS + CREATED BY
// ======================================================
//
// Useful when you need to know which admin/manager
// created inventory inside the business.
//
productInventorySchema.index({
  business: 1,
  createdBy: 1,
});

// ======================================================
// BUSINESS + STOCK LOOKUP
// ======================================================

productInventorySchema.index({
  business: 1,
  quantity: 1,
});

// ======================================================
// BUSINESS + ACTIVE STATUS
// ======================================================

productInventorySchema.index({
  business: 1,
  isActive: 1,
});

// ======================================================
// MODEL
// ======================================================

const ProductInventory = mongoose.model(
  "ProductInventory",
  productInventorySchema
);

export default ProductInventory;