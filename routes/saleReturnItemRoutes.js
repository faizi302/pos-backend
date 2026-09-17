import express from "express";

import {
  createSaleReturnItem,
  getAllSaleReturnItems,
  getSaleReturnItemsByReturn,
  getSaleReturnItemById,
  updateSaleReturnItem,
  deleteSaleReturnItem,
} from "../controllers/saleReturnItemController.js";

import {protect} from "../middlewares/auth.middleware.js";
import { authorize } from "../middlewares/permission.middleware.js";
import validate from "../middlewares/validate.js";

import {
  createSaleReturnItemSchema,
  updateSaleReturnItemSchema,
} from "../validations/saleReturnItem.validation.js";

const router = express.Router();


// ==================================================
// CREATE
// ==================================================

router.post(
  "/",
  protect,
  authorize("sale-return-items.create"),
  validate(createSaleReturnItemSchema),
  createSaleReturnItem
);


// ==================================================
// GET ALL
// ==================================================

router.get(
  "/",
  protect,
  authorize("sale-return-items.read"),
  getAllSaleReturnItems
);


// ==================================================
// GET ITEMS BY RETURN
// Keep before /:id
// ==================================================

router.get(
  "/return/:returnId",
  protect,
  authorize("sale-return-items.read"),
  getSaleReturnItemsByReturn
);


// ==================================================
// GET BY ID
// ==================================================

router.get(
  "/:id",
  protect,
  authorize("sale-return-items.read"),
  getSaleReturnItemById
);


// ==================================================
// UPDATE
// ==================================================

router.patch(
  "/:id",
  protect,
  authorize("sale-return-items.update"),
  validate(updateSaleReturnItemSchema),
  updateSaleReturnItem
);


// ==================================================
// DELETE
// ==================================================

router.delete(
  "/:id",
  protect,
  authorize("sale-return-items.delete"),
  deleteSaleReturnItem
);


export default router;