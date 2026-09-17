import Joi from "joi";

// =====================================================
// CREATE BUSINESS TYPE VALIDATION
// =====================================================

export const createBusinessTypeSchema = Joi.object({
    name: Joi.string()
        .trim()
        .min(2)
        .max(100)
        .required()
        .messages({
            "string.empty": "Business type name is required",
            "string.min": "Business type name must be at least 2 characters",
            "string.max":
                "Business type name cannot exceed 100 characters",
            "any.required": "Business type name is required",
        }),

    business: Joi.string()
        .hex()
        .length(24)
        .required()
        .messages({
            "string.empty": "Business is required",
            "string.hex": "Business ID must be a valid MongoDB ObjectId",
            "string.length":
                "Business ID must be a valid MongoDB ObjectId",
            "any.required": "Business is required",
        }),

    description: Joi.string()
        .trim()
        .max(500)
        .optional()
        .allow("")
        .messages({
            "string.max":
                "Description cannot exceed 500 characters",
        }),

    isActive: Joi.boolean()
        .optional()
        .default(true)
        .messages({
            "boolean.base": "isActive must be true or false",
        }),
});


// =====================================================
// UPDATE BUSINESS TYPE VALIDATION
// =====================================================

export const updateBusinessTypeSchema = Joi.object({
    name: Joi.string()
        .trim()
        .min(2)
        .max(100)
        .optional()
        .messages({
            "string.empty": "Business type name cannot be empty",
            "string.min":
                "Business type name must be at least 2 characters",
            "string.max":
                "Business type name cannot exceed 100 characters",
        }),

    business: Joi.string()
        .hex()
        .length(24)
        .optional()
        .messages({
            "string.hex":
                "Business ID must be a valid MongoDB ObjectId",
            "string.length":
                "Business ID must be a valid MongoDB ObjectId",
        }),

    description: Joi.string()
        .trim()
        .max(500)
        .optional()
        .allow("")
        .messages({
            "string.max":
                "Description cannot exceed 500 characters",
        }),

    isActive: Joi.boolean()
        .optional()
        .messages({
            "boolean.base": "isActive must be true or false",
        }),
});