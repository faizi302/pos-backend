import mongoose from "mongoose";

const brandSchema = new mongoose.Schema(
  {
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
      required: [true, "Brand name is required"],
      trim: true,
      maxlength: [100, "Brand name cannot exceed 100 characters"],
    },

    description: {
      type: String,
      trim: true,
      maxlength: [500, "Description cannot exceed 500 characters"],
      default: "",
    },

    tenantOwner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Tenant owner is required"],
      index: true,
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

// Unique name per tenant + business + businessType
brandSchema.index(
  {
    tenantOwner: 1,
    business: 1,
    businessType: 1,
    name: 1,
  },
  {
    unique: true,
  }
);

brandSchema.index({
  business: 1,
  businessType: 1,
  isActive: 1,
});

const Brand = mongoose.model("Brand", brandSchema);

export default Brand;