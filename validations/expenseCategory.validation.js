import Joi from "joi";

const objectId = Joi.string().hex().length(24);

export const createExpenseCategorySchema = Joi.object({
  business: objectId.optional(),

  name: Joi.string()
    .trim()
    .max(100)
    .required()
    .messages({
      "any.required": "Expense category name is required.",
      "string.empty": "Expense category name cannot be empty.",
      "string.max":
        "Expense category name cannot exceed 100 characters.",
    }),

  slug: Joi.string()
    .trim()
    .lowercase()
    .max(120)
    .optional(),

  description: Joi.string()
    .trim()
    .max(500)
    .optional(),

  isActive: Joi.boolean().optional(),
}).unknown(false);

export const updateExpenseCategorySchema = Joi.object({
  name: Joi.string()
    .trim()
    .max(100)
    .optional(),

  slug: Joi.string()
    .trim()
    .lowercase()
    .max(120)
    .optional(),

  description: Joi.string()
    .trim()
    .max(500)
    .optional(),

  isActive: Joi.boolean().optional(),
})
  .min(1)
  .unknown(false);