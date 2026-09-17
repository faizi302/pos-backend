import Joi from "joi";

const objectId = Joi.string()
  .pattern(/^[0-9a-fA-F]{24}$/)
  .messages({
    "string.pattern.base": "Invalid ObjectId.",
  });

const createStockMovementSchema = Joi.object({
  business: objectId.optional(),

  product: objectId.required().messages({
    "any.required": "Product is required.",
    "string.empty": "Product is required.",
  }),

  productInventory: objectId.required().messages({
    "any.required": "Product inventory is required.",
    "string.empty": "Product inventory is required.",
  }),

  movementType: Joi.string()
    .valid("in", "out", "adjustment")
    .required()
    .messages({
      "any.required": "Movement type is required.",
      "any.only":
        "Movement type must be in, out or adjustment.",
    }),

  adjustmentType: Joi.when("movementType", {
    is: "adjustment",
    then: Joi.string()
      .valid("increase", "decrease")
      .required()
      .messages({
        "any.required":
          "Adjustment type is required for stock adjustment.",
        "any.only":
          "Adjustment type must be increase or decrease.",
      }),

    otherwise: Joi.forbidden(),
  }),

  quantity: Joi.number()
    .positive()
    .precision(3)
    .required()
    .messages({
      "any.required": "Quantity is required.",
      "number.base": "Quantity must be a number.",
      "number.positive":
        "Quantity must be greater than 0.",
    }),

  referenceType: Joi.string()
    .valid(
      "purchase",
      "sale",
      "purchase_return",
      "sale_return",
      "opening_stock",
      "adjustment"
    )
    .required()
    .messages({
      "any.required": "Reference type is required.",
      "any.only": "Invalid reference type.",
    }),

  referenceId: objectId.optional(),

  purchase: objectId.optional(),

  purchaseItem: objectId.optional(),

  sale: objectId.optional(),

  saleItem: objectId.optional(),

  reason: Joi.string()
    .trim()
    .max(300)
    .allow("")
    .optional(),

  notes: Joi.string()
    .trim()
    .max(1000)
    .allow("")
    .optional(),
}).unknown(false);

export { createStockMovementSchema };