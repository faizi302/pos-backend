import Joi from "joi";

// ======================================================
// MongoDB ObjectId
// ======================================================

const objectId = Joi.string()
  .hex()
  .length(24);

// ======================================================
// CREATE PAYMENT VALIDATION
// ======================================================
//
// Frontend sends only:
//
// {
//   saleId: "..."
// }
//
// Backend determines:
// - amount from Sale.dueAmount
// - currency = PKR
// - PKR -> USD conversion for PayPal
// - returnUrl from environment
// - cancelUrl from environment
//
// ======================================================

export const createPaymentSchema = Joi.object({
  saleId: objectId.required(),
}).unknown(false);