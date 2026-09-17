import Joi from "joi";

const objectId = Joi.string().hex().length(24);

export const createExpenseSchema = Joi.object({
  business: objectId.optional(),

  expenseCategory: objectId.required().messages({
    "any.required": "Expense category is required.",
    "string.empty": "Expense category is required.",
    "string.length": "Invalid expense category ID.",
    "string.hex": "Invalid expense category ID.",
  }),

  expenseNumber: Joi.string()
    .trim()
    .uppercase()
    .max(50)
    .optional(),

  expenseDate: Joi.date().optional(),

  title: Joi.string()
    .trim()
    .max(200)
    .required()
    .messages({
      "any.required": "Expense title is required.",
      "string.empty": "Expense title cannot be empty.",
      "string.max":
        "Expense title cannot exceed 200 characters.",
    }),

  description: Joi.string()
    .trim()
    .max(1000)
    .optional(),

  amount: Joi.number()
    .min(0)
    .required()
    .messages({
      "any.required": "Expense amount is required.",
      "number.min": "Expense amount cannot be negative.",
    }),

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
    .optional(),

  status: Joi.string()
    .valid("draft", "paid", "cancelled")
    .optional(),

  notes: Joi.string()
    .trim()
    .max(1000)
    .optional(),
}).unknown(false);

export const updateExpenseSchema = Joi.object({
  expenseCategory: objectId.optional(),

  expenseDate: Joi.date().optional(),

  title: Joi.string()
    .trim()
    .max(200)
    .optional(),

  description: Joi.string()
    .trim()
    .max(1000)
    .optional(),

  amount: Joi.number()
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
    .optional(),

  status: Joi.string()
    .valid("draft", "paid", "cancelled")
    .optional(),

  notes: Joi.string()
    .trim()
    .max(1000)
    .optional(),
})
  .min(1)
  .unknown(false);