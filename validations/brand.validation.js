import Joi from "joi";

const objectId = Joi.string()
  .hex()
  .length(24)
  .messages({
    "string.hex": "Must be a valid MongoDB ObjectId",
    "string.length": "Must be a valid MongoDB ObjectId",
  });

// Admin: business / businessType optional (from tenantContext)
// Super Admin: enforced in controller

export const createBrandSchema = Joi.object({
  name: Joi.string().trim().min(2).max(100).required().messages({
    "string.empty": "Brand name is required",
    "string.min": "Brand name must be at least 2 characters",
    "string.max": "Brand name cannot exceed 100 characters",
    "any.required": "Brand name is required",
  }),

  description: Joi.string().trim().max(500).allow("").optional(),

  isActive: Joi.boolean().optional().default(true),

  business: objectId.optional(),
  businessType: objectId.optional(),
  tenantOwner: objectId.optional(),
}).unknown(false);

export const updateBrandSchema = Joi.object({
  name: Joi.string().trim().min(2).max(100).optional().messages({
    "string.empty": "Brand name cannot be empty",
    "string.min": "Brand name must be at least 2 characters",
    "string.max": "Brand name cannot exceed 100 characters",
  }),

  description: Joi.string().trim().max(500).allow("").optional(),

  isActive: Joi.boolean().optional(),

  business: objectId.optional(),
  businessType: objectId.optional(),
  tenantOwner: objectId.optional(),
})
  .min(1)
  .unknown(false);