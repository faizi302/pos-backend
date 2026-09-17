import Joi from "joi";

// =====================================================
// OBJECT ID VALIDATION
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
// BOOLEAN
// Supports JSON and multipart/form-data values
// =====================================================

const booleanValue = Joi.alternatives()
  .try(
    Joi.boolean(),
    Joi.string()
      .valid("true", "false")
      .custom((value) => value === "true")
  )
  .messages({
    "alternatives.types": "Value must be true or false",
  });

// =====================================================
// NUMBER
// Supports JSON and multipart/form-data values
// =====================================================

const numberValue = Joi.number()
  .min(0)
  .messages({
    "number.base": "Value must be a number",
    "number.min": "Value cannot be negative",
  });

// =====================================================
// PRODUCT BASE SCHEMA
// =====================================================

const productBaseSchema = {
  // ---------------------------------------------------
  // Business
  // ---------------------------------------------------

  business: objectId
    .optional()
    .messages({
      "string.base": "Business must be a valid ID",
    }),

  // ---------------------------------------------------
  // Business Type
  // ---------------------------------------------------

  businessType: objectId
    .required()
    .messages({
      "any.required": "Business type is required",
      "string.hex": "Invalid business type ID",
      "string.length": "Invalid business type ID",
    }),

  // ---------------------------------------------------
  // Category
  // ---------------------------------------------------

  category: objectId
    .required()
    .messages({
      "any.required": "Category is required",
      "string.hex": "Invalid category ID",
      "string.length": "Invalid category ID",
    }),

  // ---------------------------------------------------
  // Brand
  // ---------------------------------------------------

  brand: objectId
    .required()
    .messages({
      "any.required": "Brand is required",
      "string.hex": "Invalid brand ID",
      "string.length": "Invalid brand ID",
    }),

  // ---------------------------------------------------
  // Model
  // Optional
  // ---------------------------------------------------

  model: objectId
    .allow("", null)
    .optional()
    .messages({
      "string.hex": "Invalid model ID",
      "string.length": "Invalid model ID",
    }),

  // ---------------------------------------------------
  // Product Name
  // Optional
  //
  // Controller can automatically generate:
  // Brand + Model
  // ---------------------------------------------------

  name: Joi.string()
    .trim()
    .min(2)
    .max(200)
    .allow("", null)
    .optional()
    .messages({
      "string.base": "Product name must be a string",
      "string.min":
        "Product name must be at least 2 characters",
      "string.max":
        "Product name cannot exceed 200 characters",
    }),

  // ---------------------------------------------------
  // Slug
  // ---------------------------------------------------

  slug: Joi.string()
    .trim()
    .lowercase()
    .max(250)
    .allow("", null)
    .optional()
    .messages({
      "string.max":
        "Product slug cannot exceed 250 characters",
    }),

  // ---------------------------------------------------
  // SKU
  // ---------------------------------------------------

  sku: Joi.string()
    .trim()
    .uppercase()
    .min(2)
    .max(100)
    .required()
    .messages({
      "string.empty": "SKU is required",
      "string.min":
        "SKU must be at least 2 characters",
      "string.max":
        "SKU cannot exceed 100 characters",
      "any.required": "SKU is required",
    }),

  // ---------------------------------------------------
  // Barcode
  // ---------------------------------------------------

  barcode: Joi.string()
    .trim()
    .max(100)
    .allow("", null)
    .optional()
    .messages({
      "string.max":
        "Barcode cannot exceed 100 characters",
    }),

  // ---------------------------------------------------
  // Barcode Type
  // ---------------------------------------------------

  barcodeType: Joi.string()
    .valid(
      "EAN-13",
      "EAN-8",
      "UPC",
      "CODE128",
      "ISBN",
      "QR",
      "CUSTOM"
    )
    .default("CUSTOM")
    .messages({
      "any.only": "Invalid barcode type",
    }),

  // ---------------------------------------------------
  // Short Description
  // ---------------------------------------------------

  shortDescription: Joi.string()
    .trim()
    .max(500)
    .allow("", null)
    .optional()
    .messages({
      "string.max":
        "Short description cannot exceed 500 characters",
    }),

  // ---------------------------------------------------
  // Description
  // ---------------------------------------------------

  description: Joi.string()
    .trim()
    .allow("", null)
    .optional()
    .messages({
      "string.max":
        "Description cannot exceed 500 characters",
    }),

  // ---------------------------------------------------
  // Product Type
  // ---------------------------------------------------

  productType: Joi.string()
    .valid(
      "simple",
      "variable",
      "service",
      "digital",
      "bundle"
    )
    .default("simple")
    .messages({
      "any.only": "Invalid product type",
    }),

  // ---------------------------------------------------
  // Unit
  // ---------------------------------------------------

  unit: Joi.string()
    .valid(
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
      "other"
    )
    .default("piece")
    .messages({
      "any.only": "Invalid product unit",
    }),

  // ---------------------------------------------------
  // Purchase Price
  // ---------------------------------------------------

  purchasePrice: numberValue
    .default(0)
    .messages({
      "number.base":
        "Purchase price must be a number",
      "number.min":
        "Purchase price cannot be negative",
    }),

  // ---------------------------------------------------
  // Sale Price
  // ---------------------------------------------------

  salePrice: numberValue
    .required()
    .messages({
      "number.base":
        "Sale price must be a number",
      "number.min":
        "Sale price cannot be negative",
      "any.required":
        "Sale price is required",
    }),

  // ---------------------------------------------------
  // Discount
  // ---------------------------------------------------

  discount: Joi.number()
    .min(0)
    .max(100)
    .default(0)
    .messages({
      "number.base":
        "Discount must be a number",
      "number.min":
        "Discount cannot be negative",
      "number.max":
        "Discount cannot exceed 100%",
    }),

  // ---------------------------------------------------
  // Tax
  // ---------------------------------------------------

  tax: Joi.number()
    .min(0)
    .max(100)
    .default(0)
    .messages({
      "number.base": "Tax must be a number",
      "number.min":
        "Tax cannot be negative",
      "number.max":
        "Tax cannot exceed 100%",
    }),

  // ---------------------------------------------------
  // Has Variants
  // ---------------------------------------------------

  hasVariants: booleanValue
    .default(false)
    .messages({
      "alternatives.match":
        "hasVariants must be true or false",
    }),

  // ---------------------------------------------------
  // Featured
  // ---------------------------------------------------

  isFeatured: booleanValue
    .default(false)
    .messages({
      "alternatives.match":
        "isFeatured must be true or false",
    }),

  // ---------------------------------------------------
  // Active
  // ---------------------------------------------------

  isActive: booleanValue
    .default(true)
    .messages({
      "alternatives.match":
        "isActive must be true or false",
    }),
};

// =====================================================
// CREATE PRODUCT
// =====================================================

export const createProductSchema = Joi.object({
  ...productBaseSchema,
}).unknown(false);

// =====================================================
// UPDATE PRODUCT
// =====================================================

export const updateProductSchema = Joi.object({
  business: productBaseSchema.business,

  businessType:
    productBaseSchema.businessType.optional(),

  category:
    productBaseSchema.category.optional(),

  brand:
    productBaseSchema.brand.optional(),

  model:
    productBaseSchema.model.optional(),

  name:
    productBaseSchema.name.optional(),

  slug:
    productBaseSchema.slug.optional(),

  sku:
    productBaseSchema.sku.optional(),

  barcode:
    productBaseSchema.barcode.optional(),

  barcodeType:
    productBaseSchema.barcodeType.optional(),

  shortDescription:
    productBaseSchema.shortDescription.optional(),

  description:
    productBaseSchema.description.optional(),

  productType:
    productBaseSchema.productType.optional(),

  unit:
    productBaseSchema.unit.optional(),

  purchasePrice:
    productBaseSchema.purchasePrice.optional(),

  salePrice:
    productBaseSchema.salePrice.optional(),

  discount:
    productBaseSchema.discount.optional(),

  tax:
    productBaseSchema.tax.optional(),

  hasVariants:
    productBaseSchema.hasVariants.optional(),

  isFeatured:
    productBaseSchema.isFeatured.optional(),

  isActive:
    productBaseSchema.isActive.optional(),

  // Used when updating Cloudinary images
  removeImages: Joi.any().optional(),
})
  .min(1)
  .messages({
    "object.min":
      "At least one field is required to update the product",
  })
  .unknown(false);