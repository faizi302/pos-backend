import Joi from "joi";

const objectId = Joi.string().hex().length(24);

export const openCashRegisterSchema = Joi.object({
  business: objectId.optional(),

  openingBalance: Joi.number()
    .min(0)
    .required(),

  notes: Joi.string()
    .trim()
    .max(1000)
    .optional(),
}).unknown(false);

export const closeCashRegisterSchema = Joi.object({
  actualClosingBalance: Joi.number()
    .min(0)
    .required(),

  notes: Joi.string()
    .trim()
    .max(1000)
    .optional(),
}).unknown(false);

export const cashInSchema = Joi.object({
  amount: Joi.number()
    .positive()
    .required(),

  notes: Joi.string()
    .trim()
    .max(500)
    .optional(),
}).unknown(false);

export const cashOutSchema = Joi.object({
  amount: Joi.number()
    .positive()
    .required(),

  notes: Joi.string()
    .trim()
    .max(500)
    .optional(),
}).unknown(false);