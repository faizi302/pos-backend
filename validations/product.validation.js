
import Joi from "joi";

// =====================================================
// OBJECT ID
// =====================================================

const objectId = Joi.string()
  .hex()
  .length(24)
  .messages({
    "string.base": "ID must be a string",
    "string.hex": "Invalid ID format",
    "string.length": "Invalid ID",
  });

// =====================================================
// BOOLEAN — JSON + multipart ("true" / "false")
// =====================================================

const booleanValue = Joi.alternatives()
  .try(
    Joi.boolean(),

    Joi.string()
      .valid("true", "false", "1", "0")
      .custom((value) => value === "true" || value === "1")
  )
  .messages({
    "alternatives.types": "Value must be true or false",
  });

// =====================================================
// ENUMS
// =====================================================

const BARCODE_TYPES = [
  "EAN-13",
  "EAN-8",
  "UPC",
  "CODE128",
  "ISBN",
  "QR",
  "CUSTOM",
];

const PRODUCT_TYPES = [
  "simple",
  "variable",
  "service",
  "digital",
  "bundle",
];

const UNITS = [
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
];

// =====================================================
// SHARED PRODUCT FIELDS
// =====================================================

const productFields = {
  // ===================================================
  // TENANT CONTEXT
  // Usually resolved from tenantContext/controller
  // ===================================================

  tenantOwner: objectId.optional(),

  business: objectId.optional(),

  businessType: objectId.optional(),

  // ===================================================
  // PRODUCT RELATIONS
  // ===================================================

  category: objectId.messages({
    "any.required": "Category is required",
    "string.hex": "Invalid category ID",
    "string.length": "Invalid category ID",
  }),

  brand: objectId.messages({
    "any.required": "Brand is required",
    "string.hex": "Invalid brand ID",
    "string.length": "Invalid brand ID",
  }),

  model: objectId
    .allow("", null)
    .optional()
    .messages({
      "string.hex": "Invalid model ID",
      "string.length": "Invalid model ID",
    }),

  // ===================================================
  // BASIC PRODUCT INFORMATION
  // ===================================================

  name: Joi.string()
    .trim()
    .min(2)
    .max(200)
    .messages({
      "string.empty": "Product name is required",
      "string.min": "Product name must be at least 2 characters",
      "string.max": "Product name cannot exceed 200 characters",
      "any.required": "Product name is required",
    }),

  // ===================================================
  // BACKEND GENERATED
  // ===================================================
  // slug and sku are intentionally NOT accepted
  // from the frontend.
  //
  // Backend generates:
  // slug -> product-name based URL slug
  // sku  -> tenant-scoped unique SKU
  // ===================================================

  // ===================================================
  // BARCODE
  // ===================================================

  barcode: Joi.string()
    .trim()
    .max(100)
    .allow("", null)
    .optional()
    .messages({
      "string.max": "Barcode cannot exceed 100 characters",
    }),

  barcodeType: Joi.string()
    .valid(...BARCODE_TYPES)
    .default("CUSTOM")
    .messages({
      "any.only": `Barcode type must be one of: ${BARCODE_TYPES.join(", ")}`,
    }),

  // ===================================================
  // DESCRIPTION
  // ===================================================

  shortDescription: Joi.string()
    .trim()
    .max(500)
    .allow("", null)
    .optional()
    .messages({
      "string.max":
        "Short description cannot exceed 500 characters",
    }),

  description: Joi.string()
    .trim()
    .allow("", null)
    .optional(),

  // ===================================================
  // PRODUCT TYPE
  // ===================================================

  productType: Joi.string()
    .valid(...PRODUCT_TYPES)
    .default("simple")
    .messages({
      "any.only": `Product type must be one of: ${PRODUCT_TYPES.join(", ")}`,
    }),

  // ===================================================
  // UNIT
  // ===================================================

  unit: Joi.string()
    .valid(...UNITS)
    .default("piece")
    .messages({
      "any.only": `Unit must be one of: ${UNITS.join(", ")}`,
    }),

  // ===================================================
  // VARIANTS / SERIAL TRACKING
  // ===================================================

  hasVariants: booleanValue.default(false),

  trackSerial: booleanValue.default(false),

  // ===================================================
  // STATUS / DISPLAY
  // ===================================================

  isFeatured: booleanValue.default(false),

  isActive: booleanValue.default(true),
};

// =====================================================
// CREATE PRODUCT
// =====================================================
//
// REQUIRED:
// - category
// - brand
// - name
//
// OPTIONAL:
// - model
// - barcode
// - barcodeType
// - shortDescription
// - description
// - productType
// - unit
// - hasVariants
// - trackSerial
// - isFeatured
// - isActive
// - tenantOwner
// - business
// - businessType
//
// BACKEND GENERATED:
// - sku
// - slug
//
// NOT PART OF PRODUCT:
// - purchasePrice
// - salePrice
// - discount
// - tax
// =====================================================

export const createProductSchema = Joi.object({
  // Tenant context
  tenantOwner: productFields.tenantOwner,
  business: productFields.business,
  businessType: productFields.businessType,

  // Required
  category: productFields.category.required(),

  brand: productFields.brand.required(),

  name: productFields.name.required(),

  // Optional
  model: productFields.model,

  barcode: productFields.barcode,

  barcodeType: productFields.barcodeType,

  shortDescription: productFields.shortDescription,

  description: productFields.description,

  productType: productFields.productType,

  unit: productFields.unit,

  hasVariants: productFields.hasVariants,

  trackSerial: productFields.trackSerial,

  isFeatured: productFields.isFeatured,

  isActive: productFields.isActive,
})
  .unknown(false);

// =====================================================
// UPDATE PRODUCT
// =====================================================
//
// All editable Product fields are optional.
// At least one field is required.
//
// SKU and slug cannot be updated from frontend.
// They remain backend-controlled.
//
// Financial fields are NOT included here because they
// belong to ProductInventory.
//
// removeImages:
// - string
// - string[]
// - multipart value
// =====================================================

export const updateProductSchema = Joi.object({
  // Tenant context
  tenantOwner: productFields.tenantOwner,

  business: productFields.business,

  businessType: productFields.businessType,

  // Product relations
  category: productFields.category.optional(),

  brand: productFields.brand.optional(),

  model: productFields.model,

  // Basic information
  name: productFields.name.optional(),

  // Barcode
  barcode: productFields.barcode,

  barcodeType: productFields.barcodeType.optional(),

  // Description
  shortDescription: productFields.shortDescription,

  description: productFields.description,

  // Product settings
  productType: productFields.productType.optional(),

  unit: productFields.unit.optional(),

  hasVariants: productFields.hasVariants.optional(),

  trackSerial: productFields.trackSerial.optional(),

  // Status / display
  isFeatured: productFields.isFeatured.optional(),

  isActive: productFields.isActive.optional(),

  // ===================================================
  // CLOUDINARY IMAGES
  // ===================================================

  removeImages: Joi.alternatives()
    .try(
      Joi.array().items(Joi.string().trim()),

      Joi.string().trim(),

      Joi.any()
    )
    .optional(),
})
  .min(1)
  .messages({
    "object.min":
      "At least one field is required to update the product",
  })
  .unknown(false);
