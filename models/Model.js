import mongoose from "mongoose";

const modelSchema = new mongoose.Schema(
  {
    // =====================================================
    // TENANT / BUSINESS
    // =====================================================

    business: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Business",
      required: [true, "Business is required"],
      index: true,
    },

    // =====================================================
    // BUSINESS TYPE
    // =====================================================

    businessType: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "BusinessType",
      required: [true, "Business type is required"],
      index: true,
    },

    // =====================================================
    // BRAND
    // =====================================================

    brand: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Brand",
      required: [true, "Brand is required"],
      index: true,
    },

    // =====================================================
    // CREATOR
    // =====================================================

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

    // =====================================================
    // MODEL INFORMATION
    // =====================================================

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

    // =====================================================
    // STATUS
    // =====================================================

    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

// =========================================================
// UNIQUE MODEL PER BUSINESS + BRAND
// =========================================================
//
// Business A → Samsung → Galaxy S22
// Business B → Samsung → Galaxy S22
//
// Both are allowed.
//
// But:
// Business A → Samsung → Galaxy S22
// Business A → Samsung → Galaxy S22
//
// is NOT allowed.
//
// =========================================================

modelSchema.index(
  {
    business: 1,
    brand: 1,
    name: 1,
  },
  {
    unique: true,
  }
);

// =========================================================
// QUERY INDEX
// =========================================================

modelSchema.index({
  business: 1,
  businessType: 1,
  isActive: 1,
});

const Model = mongoose.model("Model", modelSchema);

export default Model;