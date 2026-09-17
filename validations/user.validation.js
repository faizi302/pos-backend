
import Joi from "joi";

// =====================================================
// OBJECT ID VALIDATION
// =====================================================

const objectId = Joi.string()
  .hex()
  .length(24)
  .messages({
    "string.hex": "Invalid ID format",
    "string.length": "Invalid ID format",
  });

// =====================================================
// COMMON USER FIELDS
// =====================================================

const nameField = Joi.string()
  .trim()
  .min(2)
  .max(100)
  .messages({
    "string.empty": "Name is required",
    "string.min": "Name must be at least 2 characters",
    "string.max": "Name cannot exceed 100 characters",
  });

const emailField = Joi.string()
  .trim()
  .lowercase()
  .email()
  .messages({
    "string.empty": "Email is required",
    "string.email": "Please provide a valid email",
  });

const phoneField = Joi.string()
  .trim()
  .max(30)
  .allow("", null)
  .messages({
    "string.max": "Phone number cannot exceed 30 characters",
  });

const passwordField = Joi.string()
  .min(6)
  .max(100)
  .messages({
    "string.empty": "Password is required",
    "string.min": "Password must be at least 6 characters",
    "string.max": "Password cannot exceed 100 characters",
  });

// =====================================================
// PUBLIC SIGNUP
// =====================================================
//
// POST /api/users/signup
//
// Public user does NOT select:
// - role
// - createdBy
//
// Backend automatically creates ADMIN.
//
// Business and BusinessType are optional.
// =====================================================

export const signupSchema = Joi.object({
  name: nameField.required().messages({
    "any.required": "Name is required",
    "string.empty": "Name is required",
  }),

  email: emailField.required().messages({
    "any.required": "Email is required",
    "string.empty": "Email is required",
  }),

  phone: phoneField,

  password: passwordField.required().messages({
    "any.required": "Password is required",
    "string.empty": "Password is required",
  }),

  business: objectId
    .allow(null)
    .messages({
      "string.hex": "Invalid business ID format",
      "string.length": "Invalid business ID format",
    }),

  businessType: objectId
    .allow(null)
    .messages({
      "string.hex": "Invalid business type ID format",
      "string.length": "Invalid business type ID format",
    }),
});

// =====================================================
// CREATE MANAGER
// =====================================================
//
// POST /api/users/managers
//
// Only Admin can use this endpoint.
//
// Frontend should send ONLY:
// - name
// - email
// - phone
// - password
//
// Backend automatically decides:
// - role = manager
// - business = null
// - businessType = null
// - createdBy = logged-in Admin
//
// No role/business/businessType/createdBy from frontend.
// =====================================================

export const createManagerSchema = Joi.object({
  name: nameField.required().messages({
    "any.required": "Name is required",
    "string.empty": "Name is required",
  }),

  email: emailField.required().messages({
    "any.required": "Email is required",
    "string.empty": "Email is required",
  }),

  phone: phoneField,

  password: passwordField.required().messages({
    "any.required": "Password is required",
    "string.empty": "Password is required",
  }),
});

// =====================================================
// CREATE USER
// =====================================================
//
// POST /api/users
//
// Mainly intended for Super Admin.
//
// Super Admin can select:
// - role
// - business
// - businessType
// =====================================================

export const createUserSchema = Joi.object({
  name: nameField.required().messages({
    "any.required": "Name is required",
    "string.empty": "Name is required",
  }),

  email: emailField.required().messages({
    "any.required": "Email is required",
    "string.empty": "Email is required",
  }),

  phone: phoneField,

  password: passwordField.required().messages({
    "any.required": "Password is required",
    "string.empty": "Password is required",
  }),

  role: objectId.required().messages({
    "any.required": "Role is required",
  }),

  business: objectId
    .allow(null)
    .messages({
      "string.hex": "Invalid business ID format",
      "string.length": "Invalid business ID format",
    }),

  businessType: objectId
    .allow(null)
    .messages({
      "string.hex": "Invalid business type ID format",
      "string.length": "Invalid business type ID format",
    }),

  status: Joi.string()
    .valid("active", "inactive", "suspended")
    .default("active"),

  isEmailVerified: Joi.boolean().default(false),
});

// =====================================================
// UPDATE USER
// =====================================================
//
// PATCH /api/users/:id
//
// Role/business/businessType are included because
// Super Admin may update them.
//
// Controller must prevent Admin from changing them.
// =====================================================

export const updateUserSchema = Joi.object({
  name: Joi.string()
    .trim()
    .min(2)
    .max(100)
    .messages({
      "string.min": "Name must be at least 2 characters",
      "string.max": "Name cannot exceed 100 characters",
    }),

  email: Joi.string()
    .trim()
    .lowercase()
    .email()
    .messages({
      "string.email": "Please provide a valid email",
    }),

  phone: phoneField,

  password: Joi.string()
    .min(6)
    .max(100)
    .messages({
      "string.min": "Password must be at least 6 characters",
      "string.max": "Password cannot exceed 100 characters",
    }),

  role: objectId,

  business: objectId
    .allow(null)
    .messages({
      "string.hex": "Invalid business ID format",
      "string.length": "Invalid business ID format",
    }),

  businessType: objectId
    .allow(null)
    .messages({
      "string.hex": "Invalid business type ID format",
      "string.length": "Invalid business type ID format",
    }),

  status: Joi.string().valid(
    "active",
    "inactive",
    "suspended"
  ),

  isEmailVerified: Joi.boolean(),
})
  .min(1)
  .messages({
    "object.min": "At least one field is required to update",
  });

// =====================================================
// LOGIN
// =====================================================

export const loginUserSchema = Joi.object({
  email: emailField.required().messages({
    "any.required": "Email is required",
    "string.empty": "Email is required",
  }),

  password: Joi.string()
    .required()
    .messages({
      "string.empty": "Password is required",
      "any.required": "Password is required",
    }),
});

// =====================================================
// FORGOT PASSWORD
// =====================================================

export const forgotPasswordSchema = Joi.object({
  email: emailField.required().messages({
    "any.required": "Email is required",
    "string.empty": "Email is required",
  }),
});

// =====================================================
// VERIFY OTP
// =====================================================

export const verifyOtpSchema = Joi.object({
  email: emailField.required().messages({
    "any.required": "Email is required",
    "string.empty": "Email is required",
  }),

  otp: Joi.string()
    .pattern(/^[0-9]{6}$/)
    .required()
    .messages({
      "string.pattern.base": "OTP must be a 6-digit number",
      "string.empty": "OTP is required",
      "any.required": "OTP is required",
    }),
});

// =====================================================
// RESET PASSWORD
// =====================================================

export const resetPasswordSchema = Joi.object({
  resetToken: Joi.string()
    .required()
    .messages({
      "string.empty": "Reset token is required",
      "any.required": "Reset token is required",
    }),

  password: Joi.string()
    .min(6)
    .max(100)
    .required()
    .messages({
      "string.empty": "Password is required",
      "string.min": "Password must be at least 6 characters",
      "string.max": "Password cannot exceed 100 characters",
      "any.required": "Password is required",
    }),

  confirmPassword: Joi.string()
    .valid(Joi.ref("password"))
    .required()
    .messages({
      "any.only": "Passwords do not match",
      "string.empty": "Confirm password is required",
      "any.required": "Confirm password is required",
    }),
});
