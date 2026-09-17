import Joi from "joi";

const objectId = Joi.string()
  .pattern(/^[0-9a-fA-F]{24}$/)
  .messages({
    "string.pattern.base": "Invalid ObjectId.",
  });

const createSaleSchema = Joi.object({
  business: objectId.optional(),

  customer: objectId
    .allow(null)
    .optional(),

  saleNumber: Joi.string()
    .trim()
    .uppercase()
    .max(50)
    .optional(),

  saleDate: Joi.date()
    .optional(),

  status: Joi.string()
    .valid(
      "draft",
      "completed",
      "partially_returned",
      "returned",
      "cancelled"
    )
    .optional()
    .default("draft"),

  paymentStatus: Joi.string()
    .valid(
      "unpaid",
      "partially_paid",
      "paid",
      "refunded"
    )
    .optional(),

  subtotal: Joi.number()
    .min(0)
    .precision(2)
    .optional()
    .default(0),

  discount: Joi.number()
    .min(0)
    .precision(2)
    .optional()
    .default(0),

  tax: Joi.number()
    .min(0)
    .precision(2)
    .optional()
    .default(0),

  shippingCost: Joi.number()
    .min(0)
    .precision(2)
    .optional()
    .default(0),

  otherCharges: Joi.number()
    .min(0)
    .precision(2)
    .optional()
    .default(0),

  totalAmount: Joi.number()
    .min(0)
    .precision(2)
    .optional(),

  paidAmount: Joi.number()
    .min(0)
    .precision(2)
    .optional()
    .default(0),

  dueAmount: Joi.number()
    .min(0)
    .precision(2)
    .optional(),

  paymentMethod: Joi.string()
    .valid(
      "cash",
      "bank",
      "card",
      "cheque",
      "online",
      "credit",
      "other"
    )
    .optional()
    .default("cash"),

  referenceNumber: Joi.string()
    .trim()
    .max(100)
    .allow("")
    .optional(),

  notes: Joi.string()
    .trim()
    .max(1000)
    .allow("")
    .optional(),
})
  .unknown(false);

const updateSaleSchema = Joi.object({
  business: objectId.optional(),

  customer: objectId
    .allow(null)
    .optional(),

  saleNumber: Joi.string()
    .trim()
    .uppercase()
    .max(50)
    .optional(),

  saleDate: Joi.date()
    .optional(),

  status: Joi.string()
    .valid(
      "draft",
      "completed",
      "partially_returned",
      "returned",
      "cancelled"
    )
    .optional(),

  paymentStatus: Joi.string()
    .valid(
      "unpaid",
      "partially_paid",
      "paid",
      "refunded"
    )
    .optional(),

  subtotal: Joi.number()
    .min(0)
    .precision(2)
    .optional(),

  discount: Joi.number()
    .min(0)
    .precision(2)
    .optional(),

  tax: Joi.number()
    .min(0)
    .precision(2)
    .optional(),

  shippingCost: Joi.number()
    .min(0)
    .precision(2)
    .optional(),

  otherCharges: Joi.number()
    .min(0)
    .precision(2)
    .optional(),

  totalAmount: Joi.number()
    .min(0)
    .precision(2)
    .optional(),

  paidAmount: Joi.number()
    .min(0)
    .precision(2)
    .optional(),

  dueAmount: Joi.number()
    .min(0)
    .precision(2)
    .optional(),

  paymentMethod: Joi.string()
    .valid(
      "cash",
      "bank",
      "card",
      "cheque",
      "online",
      "credit",
      "other"
    )
    .optional(),

  referenceNumber: Joi.string()
    .trim()
    .max(100)
    .allow("")
    .optional(),

  notes: Joi.string()
    .trim()
    .max(1000)
    .allow("")
    .optional(),
})
  .min(1)
  .unknown(false);

export {
  createSaleSchema,
  updateSaleSchema,
};