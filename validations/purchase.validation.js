import Joi from "joi";

const objectId = Joi.string()
  .pattern(/^[0-9a-fA-F]{24}$/)
  .messages({
    "string.pattern.base": "Invalid ObjectId.",
  });

const createPurchaseSchema = Joi.object({
  business: objectId.optional(),

  supplier: objectId.required().messages({
    "any.required": "Supplier is required.",
  }),

  purchaseNumber: Joi.string()
    .trim()
    .uppercase()
    .max(50)
    .optional(),

  purchaseDate: Joi.date()
    .optional(),

  dueDate: Joi.date()
    .allow(null)
    .optional(),

  status: Joi.string()
    .valid(
      "draft",
      "received",
      "partially_received",
      "cancelled"
    )
    .optional(),

  paymentStatus: Joi.string()
    .valid(
      "unpaid",
      "partially_paid",
      "paid"
    )
    .optional(),

  subtotal: Joi.number()
    .min(0)
    .optional(),

  discount: Joi.number()
    .min(0)
    .optional(),

  tax: Joi.number()
    .min(0)
    .optional(),

  shippingCost: Joi.number()
    .min(0)
    .optional(),

  otherCharges: Joi.number()
    .min(0)
    .optional(),

  totalAmount: Joi.number()
    .min(0)
    .optional(),

  paidAmount: Joi.number()
    .min(0)
    .optional(),

  dueAmount: Joi.number()
    .min(0)
    .optional(),

  paymentMethod: Joi.string()
    .valid(
      "cash",
      "bank",
      "card",
      "cheque",
      "online",
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

  createdBy: objectId.optional(),

  updatedBy: objectId.allow(null).optional(),
})
  .unknown(false);

const updatePurchaseSchema = Joi.object({
  business: objectId.optional(),

  supplier: objectId.optional(),

  purchaseNumber: Joi.string()
    .trim()
    .uppercase()
    .max(50)
    .optional(),

  purchaseDate: Joi.date()
    .optional(),

  dueDate: Joi.date()
    .allow(null)
    .optional(),

  status: Joi.string()
    .valid(
      "draft",
      "received",
      "partially_received",
      "cancelled"
    )
    .optional(),

  paymentStatus: Joi.string()
    .valid(
      "unpaid",
      "partially_paid",
      "paid"
    )
    .optional(),

  subtotal: Joi.number()
    .min(0)
    .optional(),

  discount: Joi.number()
    .min(0)
    .optional(),

  tax: Joi.number()
    .min(0)
    .optional(),

  shippingCost: Joi.number()
    .min(0)
    .optional(),

  otherCharges: Joi.number()
    .min(0)
    .optional(),

  totalAmount: Joi.number()
    .min(0)
    .optional(),

  paidAmount: Joi.number()
    .min(0)
    .optional(),

  dueAmount: Joi.number()
    .min(0)
    .optional(),

  paymentMethod: Joi.string()
    .valid(
      "cash",
      "bank",
      "card",
      "cheque",
      "online",
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

  updatedBy: objectId
    .allow(null)
    .optional(),
})
  .min(1)
  .unknown(false);

export {
  createPurchaseSchema,
  updatePurchaseSchema,
};