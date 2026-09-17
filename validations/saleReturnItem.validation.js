import Joi from "joi";

const objectId = Joi.string().hex().length(24);


// ==================================================
// CREATE
// ==================================================

export const createSaleReturnItemSchema = Joi.object({
  business: objectId.optional(),

  saleReturn: objectId.required().messages({
    "any.required": "Sale return is required.",
    "string.length": "Invalid sale return ID.",
    "string.hex": "Invalid sale return ID.",
  }),

  sale: objectId.optional(),

  saleItem: objectId.required().messages({
    "any.required": "Sale item is required.",
    "string.length": "Invalid sale item ID.",
    "string.hex": "Invalid sale item ID.",
  }),

  product: objectId.optional(),

  productInventory: objectId.optional(),

  quantity: Joi.number()
    .positive()
    .required()
    .messages({
      "any.required": "Return quantity is required.",
      "number.positive":
        "Return quantity must be greater than 0.",
    }),

  salePrice: Joi.number()
    .min(0)
    .optional(),

  discount: Joi.number()
    .min(0)
    .optional(),

  tax: Joi.number()
    .min(0)
    .optional(),

  lineSubtotal: Joi.number()
    .min(0)
    .optional(),

  lineTotal: Joi.number()
    .min(0)
    .optional(),

  reason: Joi.string()
    .trim()
    .max(500)
    .optional(),
}).unknown(false);


// ==================================================
// UPDATE
// ==================================================

export const updateSaleReturnItemSchema = Joi.object({
  quantity: Joi.number()
    .positive()
    .optional(),

  discount: Joi.number()
    .min(0)
    .optional(),

  tax: Joi.number()
    .min(0)
    .optional(),

  reason: Joi.string()
    .trim()
    .max(500)
    .optional(),
})
  .min(1)
  .unknown(false);