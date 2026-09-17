import Joi from "joi";

// =====================================================
// CREATE BUSINESS VALIDATION
// =====================================================

export const createBusinessSchema = Joi.object({
    name: Joi.string()
        .trim()
        .min(2)
        .max(100)
        .required()
        .messages({
            "string.empty": "Business name is required",
            "string.min": "Business name must be at least 2 characters",
            "string.max": "Business name cannot exceed 100 characters",
            "any.required": "Business name is required",
        }),

    isActive: Joi.boolean()
        .optional()
        .default(true)
        .messages({
            "boolean.base": "isActive must be true or false",
        }),
});


// =====================================================
// UPDATE BUSINESS VALIDATION
// =====================================================

export const updateBusinessSchema = Joi.object({
    name: Joi.string()
        .trim()
        .min(2)
        .max(100)
        .optional()
        .messages({
            "string.empty": "Business name cannot be empty",
            "string.min": "Business name must be at least 2 characters",
            "string.max": "Business name cannot exceed 100 characters",
        }),

    isActive: Joi.boolean()
        .optional()
        .messages({
            "boolean.base": "isActive must be true or false",
        }),
});