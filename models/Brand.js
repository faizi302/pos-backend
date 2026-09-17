import mongoose from "mongoose";

const brandSchema = new mongoose.Schema(
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
    // BRAND INFORMATION
    // =====================================================

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
// UNIQUE BRAND PER BUSINESS
// =========================================================
//
// Business A can have:
// Samsung
//
// Business B can also have:
// Samsung
//
// But Business A cannot have Samsung twice.
//
// =========================================================

brandSchema.index(
  {
    business: 1,
    name: 1,
  },
  {
    unique: true,
  }
);

// =========================================================
// QUERY INDEX
// =========================================================

brandSchema.index({
  business: 1,
  businessType: 1,
  isActive: 1,
});

const Brand = mongoose.model("Brand", brandSchema);

export default Brand;