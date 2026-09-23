import Joi from "joi";

// =====================================================
// OBJECT ID
// =====================================================

const objectId = Joi.string()
  .hex()
  .length(24)
  .messages({
    "string.hex": "Invalid ID format",
    "string.length": "Invalid ID format",
  });

// =====================================================
// COMMON FIELDS
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

const countryField = Joi.string()
  .trim()
  .max(100)
  .allow("", null)
  .messages({
    "string.max": "Country cannot exceed 100 characters",
  });

const cityField = Joi.string()
  .trim()
  .max(100)
  .allow("", null)
  .messages({
    "string.max": "City cannot exceed 100 characters",
  });

const addressField = Joi.string()
  .trim()
  .max(500)
  .allow("", null)
  .messages({
    "string.max": "Address cannot exceed 500 characters",
  });

const confirmPasswordField = Joi.string()
  .valid(Joi.ref("password"))
  .messages({
    "any.only": "Passwords do not match",
    "string.empty": "Confirm password is required",
    "any.required": "Confirm password is required",
  });

// =====================================================
// PUBLIC SIGNUP
// =====================================================

export const signupSchema = Joi.object({
  name: nameField.required(),
  email: emailField.required(),
  phone: phoneField,
  password: passwordField.required(),
  confirmPassword: confirmPasswordField.required(),
  country: countryField,
  city: cityField,
  address: addressField,
  business: objectId.allow(null),
  businessType: objectId.allow(null),
});

// =====================================================
// CREATE MANAGER
// =====================================================

export const createManagerSchema = Joi.object({
  name: nameField.required(),
  email: emailField.required(),
  phone: phoneField,
  password: passwordField.required(),
  confirmPassword: confirmPasswordField.required(),
  country: countryField,
  city: cityField,
  address: addressField,
});

// =====================================================
// CREATE USER
// =====================================================

export const createUserSchema = Joi.object({
  name: nameField.required(),
  email: emailField.required(),
  phone: phoneField,
  password: passwordField.required(),
  confirmPassword: confirmPasswordField.required(),
  country: countryField,
  city: cityField,
  address: addressField,
  role: objectId.required(),
  business: objectId.allow(null),
  businessType: objectId.allow(null),
  status: Joi.string()
    .valid("active", "pending", "rejected", "suspended")
    .default("active"),
  isEmailVerified: Joi.boolean().default(false),
});

// =====================================================
// UPDATE USER
// =====================================================

export const updateUserSchema = Joi.object({
  name: nameField,
  email: emailField,
  phone: phoneField,
  password: passwordField,
  confirmPassword: confirmPasswordField,
  country: countryField,
  city: cityField,
  address: addressField,
  role: objectId,
  business: objectId.allow(null),
  businessType: objectId.allow(null),
  status: Joi.string().valid(
    "active",
    "pending",
    "rejected",
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
  email: emailField.required(),
  password: Joi.string().required().messages({
    "string.empty": "Password is required",
    "any.required": "Password is required",
  }),
});

// =====================================================
// FORGOT PASSWORD
// =====================================================

export const forgotPasswordSchema = Joi.object({
  email: emailField.required(),
});

// =====================================================
// VERIFY OTP
// =====================================================

export const verifyOtpSchema = Joi.object({
  email: emailField.required(),
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
  resetToken: Joi.string().required().messages({
    "string.empty": "Reset token is required",
    "any.required": "Reset token is required",
  }),
  password: passwordField.required(),
  confirmPassword: confirmPasswordField.required(),
});