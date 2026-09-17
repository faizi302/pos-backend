import express from "express";

import {
  createSale,
  getAllSales,
  getSaleById,
  updateSale,
  cancelSale,
  restoreSale,
} from "../controllers/saleController.js";

import {protect} from "../middlewares/auth.middleware.js";
import { authorize } from "../middlewares/permission.middleware.js";
import validate from "../middlewares/validate.js";

import {
  createSaleSchema,
  updateSaleSchema,
} from "../validations/sale.validation.js";

const router = express.Router();

/*
|--------------------------------------------------------------------------
| Create Sale
|--------------------------------------------------------------------------
*/

router.post(
  "/",
  protect,
  authorize("sales.create"),
  validate(createSaleSchema),
  createSale
);

/*
|--------------------------------------------------------------------------
| Get All Sales
|--------------------------------------------------------------------------
*/

router.get(
  "/",
  protect,
  authorize("sales.read"),
  getAllSales
);

/*
|--------------------------------------------------------------------------
| Get Sale By ID
|--------------------------------------------------------------------------
*/

router.get(
  "/:id",
  protect,
  authorize("sales.read"),
  getSaleById
);

/*
|--------------------------------------------------------------------------
| Update Sale
|--------------------------------------------------------------------------
*/

router.patch(
  "/:id",
  protect,
  authorize("sales.update"),
  validate(updateSaleSchema),
  updateSale
);

/*
|--------------------------------------------------------------------------
| Cancel Sale
|--------------------------------------------------------------------------
*/

router.delete(
  "/:id",
  protect,
  authorize("sales.delete"),
  cancelSale
);

/*
|--------------------------------------------------------------------------
| Restore Sale
|--------------------------------------------------------------------------
*/

router.patch(
  "/:id/restore",
  protect,
  authorize("sales.update"),
  restoreSale
);

export default router;