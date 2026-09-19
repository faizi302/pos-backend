import mongoose from "mongoose";

const productSchema = new mongoose.Schema(
    {
        // ==========================================
        // TENANT / BUSINESS
        // ==========================================
        //
        // This is the ACTUAL tenant isolation field.
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
        // their products remain completely separate.
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
        // Business is classification/context.
        // It is NOT the tenant boundary.
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
        //      ↓
        // Mobiles
        //
        // This is also classification/context,
        // not tenant isolation.
        //
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

        // ==========================================
        // SKU
        // ==========================================
        //
        // SKU must be unique INSIDE one tenant.
        //
        // Admin A:
        // SKU = SAM-S20
        //
        // Admin B:
        // SKU = SAM-S20
        //
        // Both are allowed.
        //
        sku: {
            type: String,
            required: true,
            trim: true,
            uppercase: true,
        },

        // ==========================================
        // BARCODE
        // ==========================================
        //
        // Optional barcode.
        //
        // Empty barcode values should be converted
        // to null by the controller.
        //
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
        // application logic.
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
// Same SKU in different tenants:
// Admin A → ABC-001 → allowed
// Admin B → ABC-001 → allowed
//
// Same SKU in same tenant:
// Admin A → ABC-001 → allowed once
// Admin A → ABC-001 → duplicate
//
// ==================================================

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

// ==================================================
// BARCODE INDEX
// ==================================================
//
// Barcode is optional.
//
// No barcode:
// Product A → null
// Product B → null
// Product C → null
//
// All are allowed.
//
// Real barcode:
// Tenant A + 123456789 → allowed once
// Tenant A + 123456789 → duplicate
//
// Different tenant:
// Tenant B + 123456789 → allowed
//
// ==================================================

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
            },
        },
    }
);

// ==================================================
// QUERY / FILTER INDEXES
// ==================================================

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

// ==================================================
// ACTIVE PRODUCT QUERY
// ==================================================

productSchema.index({
    tenantOwner: 1,
    isActive: 1,
});

// ==================================================
// COMMON FILTER COMBINATION
// ==================================================

productSchema.index({
    tenantOwner: 1,
    business: 1,
    businessType: 1,
    isActive: 1,
});

// ==================================================
// CATEGORY / BRAND FILTER
// ==================================================

productSchema.index({
    tenantOwner: 1,
    category: 1,
    brand: 1,
});

// ==================================================
// BRAND / MODEL FILTER
// ==================================================

productSchema.index({
    tenantOwner: 1,
    brand: 1,
    model: 1,
});

// ==================================================
// MODEL
// ==================================================

const Product = mongoose.model(
    "Product",
    productSchema
);

export default Product;