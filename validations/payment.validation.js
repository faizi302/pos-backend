import Joi from "joi";

const objectId = Joi.string()
  .hex()
  .length(24);

export const createPaymentSchema = Joi.object({
  saleId: objectId.required(),

  amount: Joi.number()
    .positive()
    .required(),

  currency: Joi.string()
    .uppercase()
    .length(3)
    .required(),

  returnUrl: Joi.string()
    .uri()
    .required(),

  cancelUrl: Joi.string()
    .uri()
    .required(),
}).unknown(false);