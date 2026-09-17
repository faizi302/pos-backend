import express from "express";

import {
  createSaleReturn,
  getAllSaleReturns,
  getSaleReturnsBySale,
  getSaleReturnById,
  updateSaleReturn,
  cancelSaleReturn,
  restoreSaleReturn,
  deleteSaleReturn,
} from "../controllers/saleReturnController.js";

import {protect} from "../middlewares/auth.middleware.js";
import { authorize } from "../middlewares/permission.middleware.js";
import validate from "../middlewares/validate.js";

import {
  createSaleReturnSchema,
  updateSaleReturnSchema,
} from "../validations/saleReturn.validation.js";

const router = express.Router();


// ==================================================
// CREATE SALE RETURN
// ==================================================

router.post(
  "/",
  protect,
  authorize("sale-returns.create"),
  validate(createSaleReturnSchema),
  createSaleReturn
);


// ==================================================
// GET ALL SALE RETURNS
// ==================================================

router.get(
  "/",
  protect,
  authorize("sale-returns.read"),
  getAllSaleReturns
);


// ==================================================
// GET RETURNS BY SALE
// IMPORTANT: Keep this before /:id
// ==================================================

router.get(
  "/sale/:saleId",
  protect,
  authorize("sale-returns.read"),
  getSaleReturnsBySale
);


// ==================================================
// GET SALE RETURN BY ID
// ==================================================

router.get(
  "/:id",
  protect,
  authorize("sale-returns.read"),
  getSaleReturnById
);


// ==================================================
// UPDATE SALE RETURN
// ==================================================

router.patch(
  "/:id",
  protect,
  authorize("sale-returns.update"),
  validate(updateSaleReturnSchema),
  updateSaleReturn
);


// ==================================================
// CANCEL SALE RETURN
// ==================================================

router.patch(
  "/:id/cancel",
  protect,
  authorize("sale-returns.update"),
  cancelSaleReturn
);


// ==================================================
// RESTORE SALE RETURN
// ==================================================

router.patch(
  "/:id/restore",
  protect,
  authorize("sale-returns.update"),
  restoreSaleReturn
);


// ==================================================
// DELETE SALE RETURN
// ==================================================

router.delete(
  "/:id",
  protect,
  authorize("sale-returns.delete"),
  deleteSaleReturn
);


export default router;