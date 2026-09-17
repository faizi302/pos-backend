import express from "express";

import {
  getDashboard,
  getSales,
  getTopProducts,
  getPurchases,
  getInventory,
  getExpenses,
  getCustomers,
  getSuppliers,
  getStockMovements,
  getPayments,
  getCashRegister,
  getProfitLoss,
} from "../controllers/reportController.js";

import {protect} from "../middlewares/auth.middleware.js";

import { authorize } from "../middlewares/permission.middleware.js";

import validate from "../middlewares/validate.js";

import {
  dashboardReportSchema,
  salesReportSchema,
  topProductsReportSchema,
  purchaseReportSchema,
  inventoryReportSchema,
  expenseReportSchema,
  customerReportSchema,
  supplierReportSchema,
  stockMovementReportSchema,
  paymentReportSchema,
  cashRegisterReportSchema,
  profitLossReportSchema,
} from "../validations/report.validaion.js";

const router = express.Router();

/*
|--------------------------------------------------------------------------
| Dashboard
|--------------------------------------------------------------------------
*/

router.get(
  "/dashboard",
  protect,
  authorize("reports.read"),
  validate(dashboardReportSchema),
  getDashboard
);

/*
|--------------------------------------------------------------------------
| Sales
|--------------------------------------------------------------------------
*/

router.get(
  "/sales",
  protect,
  authorize("reports.read"),
  validate(salesReportSchema),
  getSales
);

/*
|--------------------------------------------------------------------------
| Top Products
|--------------------------------------------------------------------------
*/

router.get(
  "/top-products",
  protect,
  authorize("reports.read"),
  validate(topProductsReportSchema),
  getTopProducts
);

/*
|--------------------------------------------------------------------------
| Purchases
|--------------------------------------------------------------------------
*/

router.get(
  "/purchases",
  protect,
  authorize("reports.read"),
  validate(purchaseReportSchema),
  getPurchases
);

/*
|--------------------------------------------------------------------------
| Inventory
|--------------------------------------------------------------------------
*/

router.get(
  "/inventory",
  protect,
  authorize("reports.read"),
  validate(inventoryReportSchema),
  getInventory
);

/*
|--------------------------------------------------------------------------
| Expenses
|--------------------------------------------------------------------------
*/

router.get(
  "/expenses",
  protect,
  authorize("reports.read"),
  validate(expenseReportSchema),
  getExpenses
);

/*
|--------------------------------------------------------------------------
| Customers
|--------------------------------------------------------------------------
*/

router.get(
  "/customers",
  protect,
  authorize("reports.read"),
  validate(customerReportSchema),
  getCustomers
);

/*
|--------------------------------------------------------------------------
| Suppliers
|--------------------------------------------------------------------------
*/

router.get(
  "/suppliers",
  protect,
  authorize("reports.read"),
  validate(supplierReportSchema),
  getSuppliers
);

/*
|--------------------------------------------------------------------------
| Stock Movements
|--------------------------------------------------------------------------
*/

router.get(
  "/stock-movements",
  protect,
  authorize("reports.read"),
  validate(stockMovementReportSchema),
  getStockMovements
);

/*
|--------------------------------------------------------------------------
| Payments
|--------------------------------------------------------------------------
*/

router.get(
  "/payments",
  protect,
  authorize("reports.read"),
  validate(paymentReportSchema),
  getPayments
);

/*
|--------------------------------------------------------------------------
| Cash Register
|--------------------------------------------------------------------------
*/

router.get(
  "/cash-register",
  protect,
  authorize("reports.read"),
  validate(cashRegisterReportSchema),
  getCashRegister
);

/*
|--------------------------------------------------------------------------
| Profit & Loss
|--------------------------------------------------------------------------
*/

router.get(
  "/profit-loss",
  protect,
  authorize("reports.read"),
  validate(profitLossReportSchema),
  getProfitLoss
);

export default router;