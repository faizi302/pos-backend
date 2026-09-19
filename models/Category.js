import mongoose from "mongoose";

const categorySchema = new mongoose.Schema(
  {
    // ==========================================
    // TENANT OWNER
    // ==========================================
    //
    // This is the actual tenant isolation field.
    //
    // Admin A:
    // tenantOwner = Admin A
    //
    // Admin B:
    // tenantOwner = Admin B
    //
    // Even if both have the same:
    // Business = Information Technology
    // BusinessType = Mobiles
    //
    // their categories remain completely separate.
    //
    tenantOwner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    // ==========================================
    // BUSINESS
    // ==========================================
    //
    // Used for classification/reporting.
    // NOT the tenant isolation field.
    //
    business: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Business",
      required: true,
      index: true,
    },

    // ==========================================
    // BUSINESS TYPE
    // ==========================================
    //
    // Example:
    //
    // Information Technology
    //   ├── Mobiles
    //   └── Laptops
    //
    businessType: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "BusinessType",
      required: true,
      index: true,
    },

    // ==========================================
    // CATEGORY INFORMATION
    // ==========================================

    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },

    slug: {
      type: String,
      trim: true,
      lowercase: true,
      maxlength: 120,
    },

    description: {
      type: String,
      trim: true,
      maxlength: 500,
      default: "",
    },

    // ==========================================
    // CATEGORY IMAGE
    // ==========================================

    image: {
      url: {
        type: String,
        default: null,
      },

      publicId: {
        type: String,
        default: null,
      },

      assetId: {
        type: String,
        default: null,
      },
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
// UNIQUE CATEGORY PER TENANT + BUSINESS + BUSINESS TYPE
// ======================================================
//
// Admin A:
// IT + Mobiles + Accessories
//
// Admin B:
// IT + Mobiles + Accessories
//
// Both are allowed because tenantOwner is different.
//
// But inside Admin A's tenant:
//
// IT + Mobiles + Accessories
// IT + Mobiles + Accessories
//
// duplicate is NOT allowed.
//
// ======================================================

categorySchema.index(
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

// ======================================================
// TENANT + ACTIVE CATEGORIES
// ======================================================

categorySchema.index({
  tenantOwner: 1,
  business: 1,
  businessType: 1,
  isActive: 1,
});

// ======================================================
// TENANT + CATEGORY NAME
// ======================================================

categorySchema.index({
  tenantOwner: 1,
  name: 1,
});

// ======================================================
// TENANT + CREATED BY
// ======================================================

categorySchema.index({
  tenantOwner: 1,
  createdBy: 1,
});

// ======================================================
// MODEL
// ======================================================

const Category = mongoose.model(
  "Category",
  categorySchema
);

export default Category;