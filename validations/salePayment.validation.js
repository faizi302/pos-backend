import Joi from "joi";

const objectId = Joi.string().hex().length(24);

export const createSalePaymentSchema = Joi.object({
  business: objectId.optional(),

  sale: objectId.required().messages({
    "any.required": "Sale is required.",
    "string.length": "Invalid sale ID.",
    "string.hex": "Invalid sale ID.",
  }),

  customer: objectId
    .allow(null)
    .optional()
    .messages({
      "string.length": "Invalid customer ID.",
      "string.hex": "Invalid customer ID.",
    }),

  paymentNumber: Joi.string()
    .trim()
    .uppercase()
    .max(50)
    .optional(),

  paymentDate: Joi.date().optional(),

  amount: Joi.number()
    .positive()
    .required()
    .messages({
      "any.required": "Payment amount is required.",
      "number.base": "Payment amount must be a number.",
      "number.positive": "Payment amount must be greater than 0.",
    }),

  currency: Joi.string()
    .trim()
    .uppercase()
    .length(3)
    .default("PKR")
    .messages({
      "string.length": "Currency must be a valid 3-letter currency code.",
    }),

  // =====================================================
  // UPDATED PAYMENT METHODS
  // =====================================================
  paymentMethod: Joi.string()
    .valid(
      "cash",
      "bank",
      "card",
      "cheque",
      "jazzcash",
      "easypaisa",
      "credit",
      "other"
    )
    .default("cash")
    .messages({
      "any.only":
        "Invalid payment method. Allowed: cash, bank, card, cheque, jazzcash, easypaisa, credit, other",
    }),

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
}).unknown(false);

export const updateSalePaymentSchema = Joi.object({
  paymentDate: Joi.date().optional(),

  amount: Joi.number()
    .positive()
    .optional()
    .messages({
      "number.base": "Payment amount must be a number.",
      "number.positive": "Payment amount must be greater than 0.",
    }),

  // =====================================================
  // UPDATED PAYMENT METHODS
  // =====================================================
  paymentMethod: Joi.string()
    .valid(
      "cash",
      "bank",
      "card",
      "cheque",
      "jazzcash",
      "easypaisa",
      "credit",
      "other"
    )
    .optional()
    .messages({
      "any.only":
        "Invalid payment method. Allowed: cash, bank, card, cheque, jazzcash, easypaisa, credit, other",
    }),

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