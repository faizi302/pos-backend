import Joi from "joi";

const objectId = Joi.string().hex().length(24);

export const createSaleItemSchema = Joi.object({
  business: objectId.optional(),

  sale: objectId.required().messages({
    "any.required": "Sale is required.",
    "string.length": "Invalid sale ID.",
    "string.hex": "Invalid sale ID.",
  }),

  product: objectId.required().messages({
    "any.required": "Product is required.",
    "string.length": "Invalid product ID.",
    "string.hex": "Invalid product ID.",
  }),

  productInventory: objectId.required().messages({
    "any.required": "Product inventory is required.",
    "string.length": "Invalid product inventory ID.",
    "string.hex": "Invalid product inventory ID.",
  }),

  // ========== NEW (allow these fields) ==========
  inventoryUnit: objectId.optional().allow(null),   // optional
  imei: Joi.string().trim().uppercase().max(20).optional().allow(null, ""),
  // ==============================================

  quantity: Joi.number().positive().required().messages({
    "any.required": "Quantity is required.",
    "number.positive": "Quantity must be greater than 0.",
  }),

  salePrice: Joi.number().min(0).optional(),
  discount: Joi.number().min(0).optional(),
  tax: Joi.number().min(0).optional(),

  lineSubtotal: Joi.number().min(0).optional(),
  lineTotal: Joi.number().min(0).optional(),
  returnedQuantity: Joi.number().min(0).optional(),
}).unknown(false);

export const updateSaleItemSchema = Joi.object({
  sale: objectId.optional(),
  product: objectId.optional(),
  productInventory: objectId.optional(),

  // ========== NEW ==========
  inventoryUnit: objectId.optional().allow(null),
  imei: Joi.string().trim().uppercase().max(20).optional().allow(null, ""),
  // =========================

  quantity: Joi.number().positive().optional(),
  salePrice: Joi.number().min(0).optional(),
  discount: Joi.number().min(0).optional(),
  tax: Joi.number().min(0).optional(),
  lineSubtotal: Joi.number().min(0).optional(),
  lineTotal: Joi.number().min(0).optional(),
  returnedQuantity: Joi.number().min(0).optional(),
})
  .min(1)
  .unknown(false);