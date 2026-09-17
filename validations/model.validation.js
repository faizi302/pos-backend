
import Joi from "joi";

// =====================================================
// CREATE MODEL VALIDATION
// =====================================================

export const createModelSchema = Joi.object({
    name: Joi.string()
        .trim()
        .min(2)
        .max(150)
        .required()
        .messages({
            "string.empty": "Model name is required",
            "string.min":
                "Model name must be at least 2 characters",
            "string.max":
                "Model name cannot exceed 150 characters",
            "any.required": "Model name is required",
        }),

    business: Joi.string()
        .hex()
        .length(24)
        .required()
        .messages({
            "string.empty": "Business is required",
            "string.hex":
                "Business ID must be a valid MongoDB ObjectId",
            "string.length":
                "Business ID must be a valid MongoDB ObjectId",
            "any.required": "Business is required",
        }),

    businessType: Joi.string()
        .hex()
        .length(24)
        .required()
        .messages({
            "string.empty":
                "Business type is required",
            "string.hex":
                "Business type ID must be a valid MongoDB ObjectId",
            "string.length":
                "Business type ID must be a valid MongoDB ObjectId",
            "any.required":
                "Business type is required",
        }),

    brand: Joi.string()
        .hex()
        .length(24)
        .required()
        .messages({
            "string.empty": "Brand is required",
            "string.hex":
                "Brand ID must be a valid MongoDB ObjectId",
            "string.length":
                "Brand ID must be a valid MongoDB ObjectId",
            "any.required": "Brand is required",
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
            "boolean.base":
                "isActive must be true or false",
        }),
});


// =====================================================
// UPDATE MODEL VALIDATION
// =====================================================

export const updateModelSchema = Joi.object({
    name: Joi.string()
        .trim()
        .min(2)
        .max(150)
        .optional()
        .messages({
            "string.empty":
                "Model name cannot be empty",
            "string.min":
                "Model name must be at least 2 characters",
            "string.max":
                "Model name cannot exceed 150 characters",
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

    businessType: Joi.string()
        .hex()
        .length(24)
        .optional()
        .messages({
            "string.hex":
                "Business type ID must be a valid MongoDB ObjectId",
            "string.length":
                "Business type ID must be a valid MongoDB ObjectId",
        }),

    brand: Joi.string()
        .hex()
        .length(24)
        .optional()
        .messages({
            "string.hex":
                "Brand ID must be a valid MongoDB ObjectId",
            "string.length":
                "Brand ID must be a valid MongoDB ObjectId",
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
            "boolean.base":
                "isActive must be true or false",
        }),
});
