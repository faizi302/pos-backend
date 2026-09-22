import Joi from "joi";

const objectId = Joi.string()
  .hex()
  .length(24)
  .messages({
    "string.hex": "Must be a valid MongoDB ObjectId",
    "string.length": "Must be a valid MongoDB ObjectId",
  });

export const createModelSchema = Joi.object({
  name: Joi.string().trim().min(1).max(150).required().messages({
    "string.empty": "Model name is required",
    "any.required": "Model name is required",
  }),

  brand: objectId.required().messages({
    "any.required": "Brand is required",
  }),

  description: Joi.string().trim().max(500).allow("").optional(),

  isActive: Joi.boolean().optional().default(true),

  business: objectId.optional(),
  businessType: objectId.optional(),
  tenantOwner: objectId.optional(),
}).unknown(false);

export const updateModelSchema = Joi.object({
  name: Joi.string().trim().min(1).max(150).optional(),

  brand: objectId.optional(),

  description: Joi.string().trim().max(500).allow("").optional(),

  isActive: Joi.boolean().optional(),

  business: objectId.optional(),
  businessType: objectId.optional(),
  tenantOwner: objectId.optional(),
})
  .min(1)
  .unknown(false);