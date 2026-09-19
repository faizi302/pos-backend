import Joi from "joi";

// ======================================================
// OBJECT ID VALIDATION
// ======================================================

const objectId = Joi.string()
  .pattern(/^[0-9a-fA-F]{24}$/)
  .messages({
    "string.pattern.base": "Invalid ObjectId.",
  });

// ======================================================
// CREATE SALE VALIDATION
// ======================================================

const createSaleSchema = Joi.object({
  // ----------------------------------------------------
  // BUSINESS
  // ----------------------------------------------------
  //
  // Optional because:
  // - Super Admin may provide business
  // - Admin / Manager context should be resolved
  //   by the backend
  //
  business: objectId.optional(),

  // ----------------------------------------------------
  // CUSTOMER
  // ----------------------------------------------------

  customer: objectId
    .allow(null)
    .optional(),

  // ----------------------------------------------------
  // SALE INFORMATION
  // ----------------------------------------------------

  saleNumber: Joi.string()
    .trim()
    .uppercase()
    .max(50)
    .optional(),

  saleDate: Joi.date()
    .optional(),

  // ----------------------------------------------------
  // SALE STATUS
  // ----------------------------------------------------

  status: Joi.string()
    .valid(
      "draft",
      "completed",
      "partially_returned",
      "returned",
      "cancelled"
    )
    .optional()
    .default("draft"),

  // ----------------------------------------------------
  // PAYMENT STATUS
  // ----------------------------------------------------

  paymentStatus: Joi.string()
    .valid(
      "unpaid",
      "partially_paid",
      "paid",
      "refunded"
    )
    .optional(),

  // ----------------------------------------------------
  // AMOUNTS
  // ----------------------------------------------------

  subtotal: Joi.number()
    .min(0)
    .precision(2)
    .optional()
    .default(0),

  discount: Joi.number()
    .min(0)
    .precision(2)
    .optional()
    .default(0),

  tax: Joi.number()
    .min(0)
    .precision(2)
    .optional()
    .default(0),

  shippingCost: Joi.number()
    .min(0)
    .precision(2)
    .optional()
    .default(0),

  otherCharges: Joi.number()
    .min(0)
    .precision(2)
    .optional()
    .default(0),

  totalAmount: Joi.number()
    .min(0)
    .precision(2)
    .optional(),

  paidAmount: Joi.number()
    .min(0)
    .precision(2)
    .optional()
    .default(0),

  dueAmount: Joi.number()
    .min(0)
    .precision(2)
    .optional(),

  // ----------------------------------------------------
  // PAYMENT
  // ----------------------------------------------------

  paymentMethod: Joi.string()
    .valid(
      "cash",
      "bank",
      "card",
      "cheque",
      "online",
      "credit",
      "other"
    )
    .optional()
    .default("cash"),

  referenceNumber: Joi.string()
    .trim()
    .max(100)
    .allow("")
    .optional(),

  // ----------------------------------------------------
  // NOTES
  // ----------------------------------------------------

  notes: Joi.string()
    .trim()
    .max(1000)
    .allow("")
    .optional(),
})
  .unknown(false);

// ======================================================
// UPDATE SALE VALIDATION
// ======================================================

const updateSaleSchema = Joi.object({
  // ----------------------------------------------------
  // BUSINESS
  // ----------------------------------------------------
  //
  // Backend should verify/resolve this against the
  // authenticated user's tenant context.
  //
  business: objectId.optional(),

  // ----------------------------------------------------
  // CUSTOMER
  // ----------------------------------------------------

  customer: objectId
    .allow(null)
    .optional(),

  // ----------------------------------------------------
  // SALE INFORMATION
  // ----------------------------------------------------

  saleNumber: Joi.string()
    .trim()
    .uppercase()
    .max(50)
    .optional(),

  saleDate: Joi.date()
    .optional(),

  // ----------------------------------------------------
  // SALE STATUS
  // ----------------------------------------------------

  status: Joi.string()
    .valid(
      "draft",
      "completed",
      "partially_returned",
      "returned",
      "cancelled"
    )
    .optional(),

  // ----------------------------------------------------
  // PAYMENT STATUS
  // ----------------------------------------------------

  paymentStatus: Joi.string()
    .valid(
      "unpaid",
      "partially_paid",
      "paid",
      "refunded"
    )
    .optional(),

  // ----------------------------------------------------
  // AMOUNTS
  // ----------------------------------------------------

  subtotal: Joi.number()
    .min(0)
    .precision(2)
    .optional(),

  discount: Joi.number()
    .min(0)
    .precision(2)
    .optional(),

  tax: Joi.number()
    .min(0)
    .precision(2)
    .optional(),

  shippingCost: Joi.number()
    .min(0)
    .precision(2)
    .optional(),

  otherCharges: Joi.number()
    .min(0)
    .precision(2)
    .optional(),

  totalAmount: Joi.number()
    .min(0)
    .precision(2)
    .optional(),

  paidAmount: Joi.number()
    .min(0)
    .precision(2)
    .optional(),

  dueAmount: Joi.number()
    .min(0)
    .precision(2)
    .optional(),

  // ----------------------------------------------------
  // PAYMENT
  // ----------------------------------------------------

  paymentMethod: Joi.string()
    .valid(
      "cash",
      "bank",
      "card",
      "cheque",
      "online",
      "credit",
      "other"
    )
    .optional(),

  referenceNumber: Joi.string()
    .trim()
    .max(100)
    .allow("")
    .optional(),

  // ----------------------------------------------------
  // NOTES
  // ----------------------------------------------------

  notes: Joi.string()
    .trim()
    .max(1000)
    .allow("")
    .optional(),
})
  .min(1)
  .unknown(false);

// ======================================================
// EXPORTS
// ======================================================

export {
  createSaleSchema,
  updateSaleSchema,
};
