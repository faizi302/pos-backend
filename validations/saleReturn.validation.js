import Joi from "joi";

const objectId = Joi.string().hex().length(24);

export const createSaleReturnSchema = Joi.object({
  // Super Admin may provide business.
  // Admin / Manager business comes from req.user.business.
  business: objectId.optional(),

  sale: objectId.required().messages({
    "any.required": "Sale is required.",
    "string.length": "Invalid sale ID.",
    "string.hex": "Invalid sale ID.",
  }),

  customer: objectId.allow(null).optional().messages({
    "string.length": "Invalid customer ID.",
    "string.hex": "Invalid customer ID.",
  }),

  returnNumber: Joi.string()
    .trim()
    .uppercase()
    .max(50)
    .optional(),

  returnDate: Joi.date().optional(),

  // New returns should normally start as draft.
  status: Joi.string()
    .valid(
      "draft",
      "completed",
      "cancelled"
    )
    .optional(),

  refundStatus: Joi.string()
    .valid(
      "not_refunded",
      "pending",
      "partially_refunded",
      "refunded",
      "customer_credit"
    )
    .optional(),

  // These are kept in validation for flexibility,
  // but controller will calculate them from ReturnItems.
  subtotal: Joi.number()
    .min(0)
    .optional(),

  discount: Joi.number()
    .min(0)
    .optional(),

  tax: Joi.number()
    .min(0)
    .optional(),

  totalAmount: Joi.number()
    .min(0)
    .optional(),

  refundAmount: Joi.number()
    .min(0)
    .optional(),

  reason: Joi.string()
    .trim()
    .max(500)
    .optional(),

  notes: Joi.string()
    .trim()
    .max(1000)
    .optional(),
}).unknown(false);


export const updateSaleReturnSchema = Joi.object({
  customer: objectId.allow(null).optional(),

  returnDate: Joi.date().optional(),

  status: Joi.string()
    .valid(
      "draft",
      "completed",
      "cancelled"
    )
    .optional(),

  refundStatus: Joi.string()
    .valid(
      "not_refunded",
      "pending",
      "partially_refunded",
      "refunded",
      "customer_credit"
    )
    .optional(),

  reason: Joi.string()
    .trim()
    .max(500)
    .optional(),

  notes: Joi.string()
    .trim()
    .max(1000)
    .optional(),
})
  .min(1)
  .unknown(false);