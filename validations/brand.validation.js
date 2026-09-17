import Joi from "joi";

// =====================================================
// CREATE BRAND VALIDATION
// =====================================================

export const createBrandSchema = Joi.object({
    name: Joi.string()
        .trim()
        .min(2)
        .max(100)
        .required()
        .messages({
            "string.empty": "Brand name is required",
            "string.min": "Brand name must be at least 2 characters",
            "string.max": "Brand name cannot exceed 100 characters",
            "any.required": "Brand name is required",
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
            "string.empty": "Business type is required",
            "string.hex":
                "Business type ID must be a valid MongoDB ObjectId",
            "string.length":
                "Business type ID must be a valid MongoDB ObjectId",
            "any.required": "Business type is required",
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
// UPDATE BRAND VALIDATION
// =====================================================

export const updateBrandSchema = Joi.object({
    name: Joi.string()
        .trim()
        .min(2)
        .max(100)
        .optional()
        .messages({
            "string.empty": "Brand name cannot be empty",
            "string.min":
                "Brand name must be at least 2 characters",
            "string.max":
                "Brand name cannot exceed 100 characters",
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



