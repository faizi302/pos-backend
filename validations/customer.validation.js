import Joi from "joi";

const objectId = Joi.string()
  .hex()
  .length(24)
  .messages({
    "string.base": "ID must be a string",
    "string.hex": "Invalid ID format",
    "string.length": "Invalid ID",
  });

const phone = Joi.string()
  .trim()
  .max(30)
  .allow("", null)
  .optional()
  .messages({
    "string.base": "Phone must be a string",
    "string.max": "Phone cannot exceed 30 characters",
  });


// ======================================================
// CUSTOMER BASE SCHEMA
// ======================================================

const customerBaseSchema = {
  // SuperAdmin can provide/select a business.
  // Normal Admin should not send this.
  // Controller uses req.user.business.
  business: objectId.optional().messages({
    "string.base": "Business must be a valid ID",
    "string.hex": "Invalid business ID",
    "string.length": "Invalid business ID",
  }),

  // ================================================
  // CUSTOMER INFORMATION
  // ================================================

  name: Joi.string()
    .trim()
    .min(2)
    .max(150)
    .required()
    .messages({
      "string.base": "Customer name must be a string",
      "string.empty": "Customer name is required",
      "string.min":
        "Customer name must be at least 2 characters",
      "string.max":
        "Customer name cannot exceed 150 characters",
      "any.required": "Customer name is required",
    }),

  phone,

  alternatePhone: phone,

  email: Joi.string()
    .trim()
    .lowercase()
    .email()
    .max(150)
    .allow("", null)
    .optional()
    .messages({
      "string.base": "Email must be a string",
      "string.email": "Please provide a valid email address",
      "string.max":
        "Email cannot exceed 150 characters",
    }),

  // ================================================
  // ADDRESS
  // ================================================

  address: Joi.string()
    .trim()
    .max(500)
    .allow("", null)
    .optional()
    .messages({
      "string.base": "Address must be a string",
      "string.max":
        "Address cannot exceed 500 characters",
    }),

  city: Joi.string()
    .trim()
    .max(100)
    .allow("", null)
    .optional()
    .messages({
      "string.base": "City must be a string",
      "string.max":
        "City cannot exceed 100 characters",
    }),

  country: Joi.string()
    .trim()
    .max(100)
    .default("Pakistan")
    .messages({
      "string.base": "Country must be a string",
      "string.max":
        "Country cannot exceed 100 characters",
    }),

  // ================================================
  // CUSTOMER ACCOUNT / CREDIT
  // ================================================

  openingBalance: Joi.number()
    .min(0)
    .default(0)
    .messages({
      "number.base":
        "Opening balance must be a number",
      "number.min":
        "Opening balance cannot be negative",
    }),

  creditLimit: Joi.number()
    .min(0)
    .default(0)
    .messages({
      "number.base":
        "Credit limit must be a number",
      "number.min":
        "Credit limit cannot be negative",
    }),

  // ================================================
  // STATUS
  // ================================================

  isActive: Joi.boolean()
    .truthy("true")
    .falsy("false")
    .default(true)
    .messages({
      "boolean.base":
        "isActive must be true or false",
    }),

  // ================================================
  // NOTES
  // ================================================

  notes: Joi.string()
    .trim()
    .max(1000)
    .allow("", null)
    .optional()
    .messages({
      "string.base": "Notes must be a string",
      "string.max":
        "Notes cannot exceed 1000 characters",
    }),
};


// ======================================================
// CREATE CUSTOMER
// ======================================================

export const createCustomerSchema = Joi.object({
  ...customerBaseSchema,
}).unknown(false);


// ======================================================
// UPDATE CUSTOMER
// ======================================================

export const updateCustomerSchema = Joi.object({
  business: customerBaseSchema.business,

  name: customerBaseSchema.name.optional(),

  phone: customerBaseSchema.phone.optional(),

  alternatePhone:
    customerBaseSchema.alternatePhone.optional(),

  email: customerBaseSchema.email.optional(),

  address:
    customerBaseSchema.address.optional(),

  city:
    customerBaseSchema.city.optional(),

  country:
    customerBaseSchema.country.optional(),

  openingBalance:
    customerBaseSchema.openingBalance.optional(),

  creditLimit:
    customerBaseSchema.creditLimit.optional(),

  isActive:
    customerBaseSchema.isActive.optional(),

  notes:
    customerBaseSchema.notes.optional(),
})
  .min(1)
  .messages({
    "object.min":
      "At least one field is required to update the customer",
  })
  .unknown(false);
