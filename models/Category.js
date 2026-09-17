import mongoose from "mongoose";

const categorySchema = new mongoose.Schema(
  {
    // ==========================================
    // TENANT / BUSINESS
    // ==========================================
    business: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Business",
      required: true,
    },

    // ==========================================
    // BUSINESS TYPE
    // ==========================================
    businessType: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "BusinessType",
      default: null,
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
    },

    // ==========================================
    // AUDIT
    // ==========================================
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

// ==========================================
// UNIQUE CATEGORY PER BUSINESS + BUSINESS TYPE
// ==========================================
//
// Example:
//
// Information Technology
//   ├── Mobiles
//   │     ├── Smartphones
//   │     └── Tablets
//   │
//   └── Laptops
//         ├── Gaming
//         └── Business
//
// "Accessories" can exist under both:
//
// Mobiles → Accessories
// Laptops → Accessories
//
// But the same category cannot be duplicated
// inside the same Business + BusinessType.
//
categorySchema.index(
  {
    business: 1,
    businessType: 1,
    name: 1,
  },
  {
    unique: true,
  }
);

// ==========================================
// BUSINESS + ACTIVE CATEGORIES
// ==========================================
//
// Useful for Admin/Manager queries such as:
//
// {
//   business,
//   isActive: true
// }
//
categorySchema.index({
  business: 1,
  isActive: 1,
});

// ==========================================
// BUSINESS TYPE + ACTIVE CATEGORIES
// ==========================================
//
// Useful when filtering categories by
// BusinessType.
//
categorySchema.index({
  businessType: 1,
  isActive: 1,
});

// ==========================================
// MODEL
// ==========================================

const Category = mongoose.model("Category", categorySchema);

export default Category;