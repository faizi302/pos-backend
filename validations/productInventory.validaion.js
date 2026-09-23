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

// =====================================================
// PERCENTAGE — 0 TO 100
// =====================================================

const percentValue = Joi.alternatives()
  .try(
    Joi.number().min(0).max(100),

    Joi.string()
      .pattern(/^\d+(\.\d+)?$/)
      .custom((value) => {
        const number = Number(value);

        if (number < 0 || number > 100) {
          throw new Error("Value must be between 0 and 100");
        }

        return number;
      })
  )
  .messages({
    "number.base": "Value must be a number",
    "number.min": "Value cannot be negative",
    "number.max": "Value cannot exceed 100",
    "alternatives.match":
      "Value must be a number between 0 and 100",
  });

// =====================================================
// TITLE CASE STRING
// =====================================================

const titleCaseString = Joi.string()
  .trim()
  .max(100)
  .allow("", null)
  .optional()
  .messages({
    "string.max": "Value cannot exceed 100 characters",
  });

// =====================================================
// IMEI
// =====================================================
//
// IMEI is stored in InventoryUnit, not ProductInventory.
//
// This field is only used when creating mobile inventory
// through the controller/service.
//
// Example:
// imeis: [
//   "356789123456789",
//   "356789123456790"
// ]
//
// Exact quantity matching and database uniqueness are
// enforced in the controller/service.
// =====================================================

const imeiValue = Joi.string()
  .trim()
  .pattern(/^\d{15}$/)
  .messages({
    "string.empty": "IMEI cannot be empty",
    "string.pattern.base": "IMEI must be exactly 15 digits",
  });

// =====================================================
// IMEI ARRAY
// =====================================================

const imeisValue = Joi.array()
  .items(imeiValue)
  .unique()
  .optional()
  .messages({
    "array.base": "IMEIs must be an array",
    "array.unique": "Duplicate IMEI numbers are not allowed",
  });

// =====================================================
// SHARED INVENTORY FIELDS
// =====================================================

const inventoryFields = {
  // ===================================================
  // TENANT CONTEXT
  // ===================================================

  tenantOwner: objectId.optional(),

  business: objectId.optional(),

  businessType: objectId.optional(),

  // ===================================================
  // PRODUCT
  // ===================================================

  product: objectId.messages({
    "any.required": "Product is required",
    "string.hex": "Invalid product ID",
    "string.length": "Invalid product ID",
  }),

  // ===================================================
  // VARIANT
  // ===================================================

  color: titleCaseString,

  size: titleCaseString,

  // ===================================================
  // STOCK
  // ===================================================

  quantity: numberValue.default(0),

  minStock: numberValue.default(0),

  maxStock: numberValue
    .allow(null)
    .optional(),

  // ===================================================
  // FINANCIAL INFORMATION
  // ===================================================

  purchasePrice: numberValue.default(0),

  salePrice: numberValue.default(0),

  discount: percentValue.default(0),

  tax: numberValue.default(0),

  // ===================================================
  // STATUS
  // ===================================================

  isActive: booleanValue.default(true),

  // ===================================================
  // MOBILE IMEIs
  // ===================================================
  //
  // These are NOT stored in ProductInventory.
  //
  // Controller creates InventoryUnit documents from
  // this array for mobile products.
  //
  // Example:
  // quantity: 3
  // imeis: [
  //   "111111111111111",
  //   "222222222222222",
  //   "333333333333333"
  // ]
  // ===================================================

  imeis: imeisValue,
};

// =====================================================
// CREATE PRODUCT INVENTORY
// =====================================================
//
// REQUIRED:
// - product
//
// OPTIONAL:
// - tenantOwner
// - business
// - businessType
// - color
// - size
// - quantity
// - minStock
// - maxStock
// - purchasePrice
// - salePrice
// - discount
// - tax
// - isActive
// - imeis
//
// MOBILE RULES ARE ENFORCED IN CONTROLLER:
// - Mobiles require IMEIs when creating serialized stock.
// - imeis.length must equal quantity.
// - Duplicate IMEIs are rejected.
// - Existing tenant IMEIs are rejected.
//
// NON-MOBILE RULE:
// - IMEIs must not be provided.
// =====================================================

export const createProductInventorySchema = Joi.object({
  // Tenant context
  tenantOwner: inventoryFields.tenantOwner,

  business: inventoryFields.business,

  businessType: inventoryFields.businessType,

  // Required
  product: inventoryFields.product.required(),

  // Variant
  color: inventoryFields.color,

  size: inventoryFields.size,

  // Stock
  quantity: inventoryFields.quantity,

  minStock: inventoryFields.minStock,

  maxStock: inventoryFields.maxStock,

  // Financial
  purchasePrice: inventoryFields.purchasePrice,

  salePrice: inventoryFields.salePrice,

  discount: inventoryFields.discount,

  tax: inventoryFields.tax,

  // Status
  isActive: inventoryFields.isActive,

  // Mobile IMEIs
  imeis: inventoryFields.imeis,
})
  .unknown(false);

// =====================================================
// UPDATE PRODUCT INVENTORY
// =====================================================
//
// All fields are optional.
// At least one field is required.
//
// IMPORTANT:
// IMEI/serial numbers should not normally be updated
// through ProductInventory.
//
// InventoryUnit should have its own update operation for:
// - IMEI
// - serialNumber
//
// If changing mobile stock quantity, the controller must
// also keep InventoryUnit records synchronized.
// =====================================================

export const updateProductInventorySchema = Joi.object({
  // Tenant context
  tenantOwner: inventoryFields.tenantOwner,

  business: inventoryFields.business,

  businessType: inventoryFields.businessType,

  // Product
  product: inventoryFields.product.optional(),

  // Variant
  color: inventoryFields.color,

  size: inventoryFields.size,

  // Stock
  quantity: inventoryFields.quantity.optional(),

  minStock: inventoryFields.minStock.optional(),

  maxStock: inventoryFields.maxStock,

  // Financial
  purchasePrice: inventoryFields.purchasePrice.optional(),

  salePrice: inventoryFields.salePrice.optional(),

  discount: inventoryFields.discount.optional(),

  tax: inventoryFields.tax.optional(),

  // Status
  isActive: inventoryFields.isActive.optional(),
})
  .min(1)
  .messages({
    "object.min":
      "At least one field is required to update the inventory",
  })
  .unknown(false);

// =====================================================
// UPDATE STOCK
// =====================================================
//
// Used when only inventory quantity is changed.
//
// Example:
// {
//   quantity: 10
// }
// =====================================================

export const updateProductInventoryStockSchema = Joi.object({
  quantity: numberValue.messages({
    "any.required": "Quantity is required",
  }),
})
  .required()
  .unknown(false);
