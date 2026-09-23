import mongoose from "mongoose";

const productSchema = new mongoose.Schema(
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

    model: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Model",
      default: null,
      index: true,
    },

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
      default: null,
    },

    sku: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
    },

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

    hasVariants: {
      type: Boolean,
      default: false,
    },

    trackSerial: {
      type: Boolean,
      default: false,
      index: true,
    },

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

    isFeatured: {
      type: Boolean,
      default: false,
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

productSchema.index(
  {
    tenantOwner: 1,
    sku: 1,
  },
  {
    unique: true,
    name: "tenantOwner_1_sku_1",
  }
);

productSchema.index(
  {
    tenantOwner: 1,
    slug: 1,
  },
  {
    unique: true,
    name: "tenantOwner_1_slug_1",
    partialFilterExpression: {
      slug: {
        $type: "string",
        $ne: "",
      },
    },
  }
);

productSchema.index(
  {
    tenantOwner: 1,
    barcode: 1,
  },
  {
    unique: true,
    name: "tenantOwner_1_barcode_1",
    partialFilterExpression: {
      barcode: {
        $type: "string",
        $ne: "",
      },
    },
  }
);

productSchema.index({
  tenantOwner: 1,
  name: 1,
});

productSchema.index({
  tenantOwner: 1,
  business: 1,
});

productSchema.index({
  tenantOwner: 1,
  businessType: 1,
});

productSchema.index({
  tenantOwner: 1,
  category: 1,
});

productSchema.index({
  tenantOwner: 1,
  brand: 1,
});

productSchema.index({
  tenantOwner: 1,
  model: 1,
});

productSchema.index({
  tenantOwner: 1,
  createdBy: 1,
});

productSchema.index({
  tenantOwner: 1,
  isActive: 1,
});

productSchema.index({
  tenantOwner: 1,
  business: 1,
  businessType: 1,
  isActive: 1,
});

productSchema.index({
  tenantOwner: 1,
  category: 1,
  brand: 1,
});

productSchema.index({
  tenantOwner: 1,
  brand: 1,
  model: 1,
});

productSchema.index({
  tenantOwner: 1,
  trackSerial: 1,
});

const Product = mongoose.model("Product", productSchema);

export default Product;