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
// NUMBER — JSON + multipart strings
// =====================================================

const numberValue = Joi.alternatives()
  .try(
    Joi.number().min(0),
    Joi.string()
      .pattern(/^\d+(\.\d+)?$/)
      .custom((value) => Number(value))
  )
  .messages({
    "number.base": "Value must be a number",
    "number.min": "Value cannot be negative",
    "alternatives.match": "Value must be a number",
  });

const percentValue = Joi.alternatives()
  .try(
    Joi.number().min(0).max(100),
    Joi.string()
      .pattern(/^\d+(\.\d+)?$/)
      .custom((value) => {
        const n = Number(value);
        if (n < 0 || n > 100) {
          throw new Error("Value must be between 0 and 100");
        }
        return n;
      })
  )
  .messages({
    "number.min": "Value cannot be negative",
    "number.max": "Value cannot exceed 100",
    "alternatives.match": "Value must be a number between 0 and 100",
  });

// =====================================================
// ENUMS (match Product.js model)
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
// SHARED FIELD DEFS
// =====================================================
//
// Admin / Manager:
//   business, businessType, tenantOwner → from tenantContext (optional in body)
// Super Admin:
//   may send business, businessType, tenantOwner (enforced in controller)
//
// =====================================================

const productFields = {
  // Tenant context (optional for Admin; controller resolves)
  tenantOwner: objectId.optional(),
  business: objectId.optional(),
  businessType: objectId.optional(),

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

  model: objectId.allow("", null).optional().messages({
    "string.hex": "Invalid model ID",
    "string.length": "Invalid model ID",
  }),

  name: Joi.string().trim().min(2).max(200).allow("", null).optional().messages({
    "string.min": "Product name must be at least 2 characters",
    "string.max": "Product name cannot exceed 200 characters",
  }),

  slug: Joi.string().trim().lowercase().max(250).allow("", null).optional().messages({
    "string.max": "Product slug cannot exceed 250 characters",
  }),

  sku: Joi.string().trim().uppercase().min(2).max(100).messages({
    "string.empty": "SKU is required",
    "string.min": "SKU must be at least 2 characters",
    "string.max": "SKU cannot exceed 100 characters",
    "any.required": "SKU is required",
  }),

  barcode: Joi.string().trim().max(100).allow("", null).optional().messages({
    "string.max": "Barcode cannot exceed 100 characters",
  }),

  barcodeType: Joi.string()
    .valid(...BARCODE_TYPES)
    .default("CUSTOM")
    .messages({
      "any.only": `Barcode type must be one of: ${BARCODE_TYPES.join(", ")}`,
    }),

  shortDescription: Joi.string().trim().max(500).allow("", null).optional().messages({
    "string.max": "Short description cannot exceed 500 characters",
  }),

  description: Joi.string().trim().allow("", null).optional(),

  productType: Joi.string()
    .valid(...PRODUCT_TYPES)
    .default("simple")
    .messages({
      "any.only": `Product type must be one of: ${PRODUCT_TYPES.join(", ")}`,
    }),

  unit: Joi.string()
    .valid(...UNITS)
    .default("piece")
    .messages({
      "any.only": `Unit must be one of: ${UNITS.join(", ")}`,
    }),

  purchasePrice: numberValue.default(0),

  salePrice: numberValue.messages({
    "any.required": "Sale price is required",
  }),

  discount: percentValue.default(0),

  tax: percentValue.default(0),

  hasVariants: booleanValue.default(false),

  trackSerial: booleanValue.default(false),

  isFeatured: booleanValue.default(false),

  isActive: booleanValue.default(true),
};

// =====================================================
// CREATE PRODUCT
// =====================================================
// Required: category, brand, sku, salePrice
// Optional: business, businessType, tenantOwner (token or Super Admin)
// =====================================================

export const createProductSchema = Joi.object({
  tenantOwner: productFields.tenantOwner,
  business: productFields.business,
  businessType: productFields.businessType,

  category: productFields.category.required(),
  brand: productFields.brand.required(),
  model: productFields.model,

  name: productFields.name,
  slug: productFields.slug,
  sku: productFields.sku.required(),
  barcode: productFields.barcode,
  barcodeType: productFields.barcodeType,

  shortDescription: productFields.shortDescription,
  description: productFields.description,

  productType: productFields.productType,
  unit: productFields.unit,

  purchasePrice: productFields.purchasePrice,
  salePrice: productFields.salePrice.required(),
  discount: productFields.discount,
  tax: productFields.tax,

  hasVariants: productFields.hasVariants,
  trackSerial: productFields.trackSerial,
  isFeatured: productFields.isFeatured,
  isActive: productFields.isActive,
})
  .unknown(false);

// =====================================================
// UPDATE PRODUCT
// =====================================================
// All fields optional; at least one required
// removeImages: string | string[] | JSON string (multipart)
// =====================================================

export const updateProductSchema = Joi.object({
  tenantOwner: productFields.tenantOwner,
  business: productFields.business,
  businessType: productFields.businessType,

  category: productFields.category.optional(),
  brand: productFields.brand.optional(),
  model: productFields.model,

  name: productFields.name,
  slug: productFields.slug,
  sku: productFields.sku.optional(),
  barcode: productFields.barcode,
  barcodeType: productFields.barcodeType.optional(),

  shortDescription: productFields.shortDescription,
  description: productFields.description,

  productType: productFields.productType.optional(),
  unit: productFields.unit.optional(),

  purchasePrice: productFields.purchasePrice.optional(),
  salePrice: productFields.salePrice.optional(),
  discount: productFields.discount.optional(),
  tax: productFields.tax.optional(),

  hasVariants: productFields.hasVariants.optional(),
  trackSerial: productFields.trackSerial.optional(),
  isFeatured: productFields.isFeatured.optional(),
  isActive: productFields.isActive.optional(),

  // Cloudinary publicIds to remove (controller accepts string or array)
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
    "object.min": "At least one field is required to update the product",
  })
  .unknown(false);