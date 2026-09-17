import mongoose from "mongoose";

const productSchema = new mongoose.Schema(
  {
    // ==========================================
    // TENANT / BUSINESS
    // ==========================================
    business: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Business",
      required: true,
      index: true,
    },

    // Describes the business type.
    // Tenant isolation is still based on business.
    businessType: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "BusinessType",
      required: true,
      index: true,
    },

    // ==========================================
    // PRODUCT RELATIONS
    // ==========================================
    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category",
      required: true,
      index: true,
    },

    brand: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Brand",
      required: true,
      index: true,
    },

    // Optional because some products/businesses
    // may not use models.
    model: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Model",
      default: null,
      index: true,
    },

    // ==========================================
    // BASIC INFORMATION
    // ==========================================
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },

    slug: {
      type: String,
      trim: true,
      lowercase: true,
    },

    // SKU must be unique inside one business.
    // Same SKU can exist in another business.
    sku: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
    },

    // Optional barcode.
    //
    // IMPORTANT:
    // Do NOT make this unique directly in the schema.
    // A partial unique index is defined below.
    barcode: {
      type: String,
      trim: true,
      default: null,
    },

    barcodeType: {
      type: String,
      enum: [
        "EAN-13",
        "EAN-8",
        "UPC",
        "CODE128",
        "ISBN",
        "QR",
        "CUSTOM",
      ],
      default: "CUSTOM",
    },

    // ==========================================
    // DESCRIPTION
    // ==========================================
    shortDescription: {
      type: String,
      trim: true,
      maxlength: 500,
      default: "",
    },

    description: {
      type: String,
      trim: true,
      default: "",
    },

    // ==========================================
    // IMAGES
    // ==========================================
    images: [
      {
        url: {
          type: String,
          required: true,
        },

        publicId: {
          type: String,
          required: true,
        },

        assetId: {
          type: String,
          default: null,
        },
      },
    ],

    // ==========================================
    // PRODUCT TYPE
    // ==========================================
    productType: {
      type: String,
      enum: [
        "simple",
        "variable",
        "service",
        "digital",
        "bundle",
      ],
      default: "simple",
    },

    // ==========================================
    // VARIANT SUPPORT
    // ==========================================
    //
    // simple   -> normally false
    // variable -> normally true
    //
    // Your controller should keep these values
    // consistent.
    hasVariants: {
      type: Boolean,
      default: false,
    },

    // ==========================================
    // UNIT
    // ==========================================
    unit: {
      type: String,
      enum: [
        "piece",
        "kg",
        "gram",
        "liter",
        "ml",
        "meter",
        "cm",
        "box",
        "pack",
        "dozen",
        "pair",
        "bottle",
        "bag",
        "carton",
        "set",
        "hour",
        "day",
        "service",
        "other",
      ],
      default: "piece",
    },

    // ==========================================
    // DEFAULT PRICING
    // ==========================================
    purchasePrice: {
      type: Number,
      min: 0,
      default: 0,
    },

    salePrice: {
      type: Number,
      required: true,
      min: 0,
    },

    // Percentage discount: 0 - 100
    discount: {
      type: Number,
      min: 0,
      max: 100,
      default: 0,
    },

    // Tax percentage/value depending on
    // your application logic.
    tax: {
      type: Number,
      min: 0,
      default: 0,
    },

    // ==========================================
    // STATUS
    // ==========================================
    isFeatured: {
      type: Boolean,
      default: false,
    },

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

// ==================================================
// SKU INDEX
// ==================================================
//
// Same SKU:
// Business A -> allowed
// Business B -> allowed
//
// Same business:
// SKU ABC -> only once
//
// This is the main product uniqueness rule.
//
// ==================================================

productSchema.index(
  { business: 1, sku: 1 },
  {
    unique: true,
    name: "business_1_sku_1",
  }
);

// ==================================================
// BARCODE INDEX
// ==================================================
//
// Barcode is OPTIONAL.
//
// Products without barcode:
// Product A -> barcode: null
// Product B -> barcode: null
// Product C -> barcode: null
//
// ALL are allowed.
//
// But if a real barcode exists:
//
// Business A + 123456789 -> allowed once
// Business A + 123456789 -> DUPLICATE
//
// The same barcode can exist in another business:
//
// Business B + 123456789 -> allowed
//
// IMPORTANT:
// The controller should convert empty barcode values
// ("", "   ") to null.
//
// ==================================================

productSchema.index(
  { business: 1, barcode: 1 },
  {
    unique: true,
    name: "business_1_barcode_1",
    partialFilterExpression: {
      barcode: {
        $type: "string",
      },
    },
  }
);

// ==================================================
// QUERY / FILTER INDEXES
// ==================================================

productSchema.index({
  business: 1,
  name: 1,
});

productSchema.index({
  business: 1,
  category: 1,
});

productSchema.index({
  business: 1,
  brand: 1,
});

productSchema.index({
  business: 1,
  model: 1,
});

productSchema.index({
  business: 1,
  createdBy: 1,
});

// Useful for active-product queries.
productSchema.index({
  business: 1,
  isActive: 1,
});

// Useful for Business + BusinessType filtering.
productSchema.index({
  business: 1,
  businessType: 1,
});

// ==================================================
// MODEL
// ==================================================

const Product = mongoose.model("Product", productSchema);

export default Product;