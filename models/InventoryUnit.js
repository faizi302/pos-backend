import mongoose from "mongoose";

const inventoryUnitSchema = new mongoose.Schema(
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

    productInventory: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ProductInventory",
      required: true,
      index: true,
    },

    imei: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },

    serialNumber: {
      type: String,
      trim: true,
      default: null,
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

inventoryUnitSchema.index(
  {
    tenantOwner: 1,
    imei: 1,
  },
  {
    unique: true,
    name: "tenantOwner_1_imei_1",
  }
);

inventoryUnitSchema.index({
  tenantOwner: 1,
  product: 1,
});

inventoryUnitSchema.index({
  tenantOwner: 1,
  productInventory: 1,
});

inventoryUnitSchema.index({
  tenantOwner: 1,
  business: 1,
  businessType: 1,
});

inventoryUnitSchema.index({
  tenantOwner: 1,
  serialNumber: 1,
});

inventoryUnitSchema.index({
  tenantOwner: 1,
  isActive: 1,
});

const InventoryUnit = mongoose.model(
  "InventoryUnit",
  inventoryUnitSchema
);

export default InventoryUnit;
