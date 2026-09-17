import Joi from "joi";

const objectId = Joi.string()
  .hex()
  .length(24);

const reportQuery = Joi.object({
  business: objectId.optional(),

  startDate: Joi.date()
    .iso()
    .optional(),

  endDate: Joi.date()
    .iso()
    .optional(),

  limit: Joi.number()
    .integer()
    .min(1)
    .max(100)
    .optional(),
}).unknown(false);

export const dashboardReportSchema =
  reportQuery;

export const salesReportSchema =
  reportQuery;

export const topProductsReportSchema =
  reportQuery;

export const purchaseReportSchema =
  reportQuery;

export const inventoryReportSchema =
  reportQuery;

export const expenseReportSchema =
  reportQuery;

export const customerReportSchema =
  reportQuery;

export const supplierReportSchema =
  reportQuery;

export const stockMovementReportSchema =
  reportQuery;

export const paymentReportSchema =
  reportQuery;

export const cashRegisterReportSchema =
  reportQuery;

export const profitLossReportSchema =
  reportQuery;