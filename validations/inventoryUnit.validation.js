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
// BOOLEAN
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
// IMEI
// =====================================================

const imeiValue = Joi.string()
  .trim()
  .pattern(/^\d{15}$/)
  .messages({
    "string.empty": "IMEI is required",
    "any.required": "IMEI is required",
    "string.pattern.base": "IMEI must be exactly 15 digits",
  });

// =====================================================
// SHARED FIELDS
// =====================================================

const inventoryUnitFields = {
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
  // PRODUCT INVENTORY
  // ===================================================

  productInventory: objectId.messages({
    "any.required": "Product inventory is required",
    "string.hex": "Invalid product inventory ID",
    "string.length": "Invalid product inventory ID",
  }),

  // ===================================================
  // IMEI
  // ===================================================

  imei: imeiValue.required(),

  // ===================================================
  // SERIAL NUMBER
  // ===================================================

  serialNumber: Joi.string()
    .trim()
    .max(100)
    .allow("", null)
    .optional()
    .messages({
      "string.max":
        "Serial number cannot exceed 100 characters",
    }),

  // ===================================================
  // STATUS
  // ===================================================

  isActive: booleanValue.default(true),
};

// =====================================================
// CREATE INVENTORY UNIT
// =====================================================
//
// REQUIRED:
// - product
// - productInventory
// - imei
//
// OPTIONAL:
// - tenantOwner
// - business
// - businessType
// - serialNumber
// - isActive
//
// createdBy is handled by controller.
// =====================================================

export const createInventoryUnitSchema = Joi.object({
  tenantOwner: inventoryUnitFields.tenantOwner,

  business: inventoryUnitFields.business,

  businessType: inventoryUnitFields.businessType,

  product: inventoryUnitFields.product.required(),

  productInventory:
    inventoryUnitFields.productInventory.required(),

  imei: inventoryUnitFields.imei.required(),

  serialNumber: inventoryUnitFields.serialNumber,

  isActive: inventoryUnitFields.isActive,
})
  .unknown(false);

// =====================================================
// UPDATE INVENTORY UNIT
// =====================================================
//
// All fields are optional.
// At least one field is required.
//
// IMEI can be updated only if your controller allows it.
// MongoDB unique index will protect duplicate IMEIs.
// =====================================================

export const updateInventoryUnitSchema = Joi.object({
  product: inventoryUnitFields.product.optional(),

  productInventory:
    inventoryUnitFields.productInventory.optional(),

  imei: inventoryUnitFields.imei.optional(),

  serialNumber: inventoryUnitFields.serialNumber,

  isActive: inventoryUnitFields.isActive.optional(),
})
  .min(1)
  .messages({
    "object.min":
      "At least one field is required to update the inventory unit",
  })
  .unknown(false);
