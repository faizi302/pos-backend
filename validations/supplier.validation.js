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

const supplierBaseSchema = {
  // Used mainly for SuperAdmin.
  // Normal Admin should not send business; controller uses req.user.business.
  business: objectId.optional().messages({
    "string.base": "Business must be a valid ID",
    "string.hex": "Invalid business ID",
    "string.length": "Invalid business ID",
  }),

  name: Joi.string()
    .trim()
    .min(2)
    .max(150)
    .required()
    .messages({
      "string.base": "Supplier name must be a string",
      "string.empty": "Supplier name is required",
      "string.min": "Supplier name must be at least 2 characters",
      "string.max": "Supplier name cannot exceed 150 characters",
      "any.required": "Supplier name is required",
    }),

  companyName: Joi.string()
    .trim()
    .max(200)
    .allow("", null)
    .optional()
    .messages({
      "string.base": "Company name must be a string",
      "string.max": "Company name cannot exceed 200 characters",
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
      "string.email": "Please provide a valid email address",
      "string.max": "Email cannot exceed 150 characters",
    }),

  address: Joi.string()
    .trim()
    .max(500)
    .allow("", null)
    .optional()
    .messages({
      "string.base": "Address must be a string",
      "string.max": "Address cannot exceed 500 characters",
    }),

  city: Joi.string()
    .trim()
    .max(100)
    .allow("", null)
    .optional()
    .messages({
      "string.base": "City must be a string",
      "string.max": "City cannot exceed 100 characters",
    }),

  country: Joi.string()
    .trim()
    .max(100)
    .default("Pakistan")
    .messages({
      "string.base": "Country must be a string",
      "string.max": "Country cannot exceed 100 characters",
    }),

  taxNumber: Joi.string()
    .trim()
    .max(100)
    .allow("", null)
    .optional()
    .messages({
      "string.base": "Tax number must be a string",
      "string.max": "Tax number cannot exceed 100 characters",
    }),

  openingBalance: Joi.number()
    .min(0)
    .default(0)
    .messages({
      "number.base": "Opening balance must be a number",
      "number.min": "Opening balance cannot be negative",
    }),

  creditLimit: Joi.number()
    .min(0)
    .default(0)
    .messages({
      "number.base": "Credit limit must be a number",
      "number.min": "Credit limit cannot be negative",
    }),

  paymentTerms: Joi.string()
    .valid(
      "cash",
      "7_days",
      "15_days",
      "30_days",
      "45_days",
      "60_days",
      "custom"
    )
    .default("cash")
    .messages({
      "any.only": "Invalid payment terms",
    }),

  notes: Joi.string()
    .trim()
    .max(1000)
    .allow("", null)
    .optional()
    .messages({
      "string.base": "Notes must be a string",
      "string.max": "Notes cannot exceed 1000 characters",
    }),

  isActive: Joi.boolean()
    .truthy("true")
    .falsy("false")
    .default(true)
    .messages({
      "boolean.base": "isActive must be true or false",
    }),
};

// CREATE
export const createSupplierSchema = Joi.object({
  ...supplierBaseSchema,
}).unknown(false);

// UPDATE
export const updateSupplierSchema = Joi.object({
  business: supplierBaseSchema.business,

  name: supplierBaseSchema.name.optional(),

  companyName: supplierBaseSchema.companyName.optional(),

  phone: supplierBaseSchema.phone.optional(),

  alternatePhone: supplierBaseSchema.alternatePhone.optional(),

  email: supplierBaseSchema.email.optional(),

  address: supplierBaseSchema.address.optional(),

  city: supplierBaseSchema.city.optional(),

  country: supplierBaseSchema.country.optional(),

  taxNumber: supplierBaseSchema.taxNumber.optional(),

  openingBalance: supplierBaseSchema.openingBalance.optional(),

  creditLimit: supplierBaseSchema.creditLimit.optional(),

  paymentTerms: supplierBaseSchema.paymentTerms.optional(),

  notes: supplierBaseSchema.notes.optional(),

  isActive: supplierBaseSchema.isActive.optional(),
})
  .min(1)
  .messages({
    "object.min": "At least one field is required to update the supplier",
  })
  .unknown(false);
