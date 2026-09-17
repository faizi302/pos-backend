import Joi from "joi";

const objectId = Joi.string()
  .pattern(/^[0-9a-fA-F]{24}$/)
  .messages({
    "string.pattern.base": "Invalid ObjectId.",
  });

/*
|--------------------------------------------------------------------------
| Create Purchase Item
|--------------------------------------------------------------------------
*/

const createPurchaseItemSchema = Joi.object({
  // SuperAdmin can optionally provide business.
  // Admin/Manager business comes from req.user.business.
  business: objectId.optional(),

  purchase: objectId.required().messages({
    "any.required": "Purchase is required.",
    "string.empty": "Purchase is required.",
  }),

  product: objectId.required().messages({
    "any.required": "Product is required.",
    "string.empty": "Product is required.",
  }),

  productInventory: objectId.required().messages({
    "any.required": "Product inventory is required.",
    "string.empty": "Product inventory is required.",
  }),

  quantity: Joi.number()
    .positive()
    .precision(3)
    .required()
    .messages({
      "any.required": "Quantity is required.",
      "number.base": "Quantity must be a number.",
      "number.positive": "Quantity must be greater than 0.",
    }),

  receivedQuantity: Joi.number()
    .min(0)
    .precision(3)
    .optional()
    .default(0)
    .messages({
      "number.base": "Received quantity must be a number.",
      "number.min": "Received quantity cannot be negative.",
    }),

  purchasePrice: Joi.number()
    .min(0)
    .precision(2)
    .required()
    .messages({
      "any.required": "Purchase price is required.",
      "number.base": "Purchase price must be a number.",
      "number.min": "Purchase price cannot be negative.",
    }),

  discount: Joi.number()
    .min(0)
    .precision(2)
    .optional()
    .default(0)
    .messages({
      "number.base": "Discount must be a number.",
      "number.min": "Discount cannot be negative.",
    }),

  tax: Joi.number()
    .min(0)
    .precision(2)
    .optional()
    .default(0)
    .messages({
      "number.base": "Tax must be a number.",
      "number.min": "Tax cannot be negative.",
    }),

  // These should normally be calculated by backend.
  // They are optional here so frontend does not need
  // to calculate them.
  lineSubtotal: Joi.number()
    .min(0)
    .optional(),

  lineTotal: Joi.number()
    .min(0)
    .optional(),

  // Do not trust these from frontend.
  // Controller should set them.
  createdBy: objectId.optional(),

  updatedBy: objectId
    .allow(null)
    .optional(),
})
  .unknown(false);


/*
|--------------------------------------------------------------------------
| Update Purchase Item
|--------------------------------------------------------------------------
*/

const updatePurchaseItemSchema = Joi.object({
  // Business should not actually be changed by Admin/Manager.
  // Controller should ignore/reject changing it.
  business: objectId.optional(),

  purchase: objectId.optional(),

  product: objectId.optional(),

  productInventory: objectId.optional(),

  quantity: Joi.number()
    .positive()
    .precision(3)
    .optional()
    .messages({
      "number.base": "Quantity must be a number.",
      "number.positive": "Quantity must be greater than 0.",
    }),

  receivedQuantity: Joi.number()
    .min(0)
    .precision(3)
    .optional()
    .messages({
      "number.base": "Received quantity must be a number.",
      "number.min": "Received quantity cannot be negative.",
    }),

  purchasePrice: Joi.number()
    .min(0)
    .precision(2)
    .optional()
    .messages({
      "number.base": "Purchase price must be a number.",
      "number.min": "Purchase price cannot be negative.",
    }),

  discount: Joi.number()
    .min(0)
    .precision(2)
    .optional()
    .messages({
      "number.base": "Discount must be a number.",
      "number.min": "Discount cannot be negative.",
    }),

  tax: Joi.number()
    .min(0)
    .precision(2)
    .optional()
    .messages({
      "number.base": "Tax must be a number.",
      "number.min": "Tax cannot be negative.",
    }),

  lineSubtotal: Joi.number()
    .min(0)
    .optional(),

  lineTotal: Joi.number()
    .min(0)
    .optional(),

  updatedBy: objectId
    .allow(null)
    .optional(),
})
  .min(1)
  .unknown(false);


export {
  createPurchaseItemSchema,
  updatePurchaseItemSchema,
};