import mongoose from "mongoose";

const modelSchema = new mongoose.Schema(
  {
    tenantOwner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Tenant owner is required"],
      index: true,
    },

    business: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Business",
      required: [true, "Business is required"],
      index: true,
    },

    businessType: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "BusinessType",
      required: [true, "Business type is required"],
      index: true,
    },

    brand: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Brand",
      required: [true, "Brand is required"],
      index: true,
    },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Created by is required"],
      index: true,
    },

    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    name: {
      type: String,
      required: [true, "Model name is required"],
      trim: true,
      maxlength: [150, "Model name cannot exceed 150 characters"],
    },

    description: {
      type: String,
      trim: true,
      maxlength: [500, "Description cannot exceed 500 characters"],
      default: "",
    },

    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

// Unique name per tenant + business + brand
modelSchema.index(
  {
    tenantOwner: 1,
    business: 1,
    brand: 1,
    name: 1,
  },
  { unique: true }
);

modelSchema.index({
  tenantOwner: 1,
  business: 1,
  businessType: 1,
  isActive: 1,
});

modelSchema.index({
  brand: 1,
  isActive: 1,
});

const Model = mongoose.model("Model", modelSchema);

export default Model;