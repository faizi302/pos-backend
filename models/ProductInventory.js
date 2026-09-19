import mongoose from "mongoose";

const productInventorySchema = new mongoose.Schema(
  {
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

    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
      index: true,
    },

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

    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },

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

productInventorySchema.index(
  {
    tenantOwner: 1,
    product: 1,
    color: 1,
    size: 1,
  },
  {
    unique: true,
    partialFilterExpression: {
      isActive: true,
    },
    name: "tenantOwner_1_product_1_color_1_size_1",
  }
);

productInventorySchema.index({
  tenantOwner: 1,
  product: 1,
});

productInventorySchema.index({
  tenantOwner: 1,
  business: 1,
  product: 1,
});

productInventorySchema.index({
  tenantOwner: 1,
  business: 1,
  businessType: 1,
  product: 1,
});

productInventorySchema.index({
  tenantOwner: 1,
  businessType: 1,
});

productInventorySchema.index({
  tenantOwner: 1,
  createdBy: 1,
});

productInventorySchema.index({
  tenantOwner: 1,
  quantity: 1,
});

productInventorySchema.index({
  tenantOwner: 1,
  isActive: 1,
});

productInventorySchema.index({
  tenantOwner: 1,
  business: 1,
  isActive: 1,
});

productInventorySchema.index({
  tenantOwner: 1,
  business: 1,
  businessType: 1,
  isActive: 1,
});

const ProductInventory = mongoose.model(
  "ProductInventory",
  productInventorySchema
);

export default ProductInventory;