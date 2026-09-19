import mongoose from "mongoose";

const saleItemSchema = new mongoose.Schema(
  {
    // =====================================================
    // TENANT / BUSINESS
    // =====================================================

    // Actual tenant owner.
    // Admin = Admin user
    // Manager = Admin owner through tenantContext
    // Super Admin = null
    tenantOwner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    // Business classification.
    // NOT the primary tenant isolation field.
    business: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Business",
      required: true,
      index: true,
    },

    // Business type classification.
    // NOT the primary tenant isolation field.
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

    // =====================================================
    // PRODUCT
    // =====================================================

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

    // =====================================================
    // ITEM DETAILS
    // =====================================================

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
// UNIQUE SALE ITEM
// =====================================================

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

// =====================================================
// TENANT / SALE INDEX
// =====================================================

saleItemSchema.index({
  tenantOwner: 1,
  business: 1,
  businessType: 1,
  sale: 1,
});

// =====================================================
// TENANT / PRODUCT INDEX
// =====================================================

saleItemSchema.index({
  tenantOwner: 1,
  business: 1,
  businessType: 1,
  product: 1,
});

// =====================================================
// TENANT / INVENTORY INDEX
// =====================================================

saleItemSchema.index({
  tenantOwner: 1,
  business: 1,
  businessType: 1,
  productInventory: 1,
});

// =====================================================
// TENANT / SALE + INVENTORY
// =====================================================

saleItemSchema.index({
  tenantOwner: 1,
  sale: 1,
  productInventory: 1,
});

// =====================================================
// MODEL
// =====================================================

const SaleItem = mongoose.model("SaleItem", saleItemSchema);

export default SaleItem;