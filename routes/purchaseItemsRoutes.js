import express from "express";

import {
  createPurchaseItem,
  getAllPurchaseItems,
  getPurchaseItemsByPurchase,
  getPurchaseItemById,
  updatePurchaseItem,
  deletePurchaseItem,
} from "../controllers/purchaseItemController.js";

import { protect } from "../middlewares/auth.middleware.js";
import { authorize } from "../middlewares/permission.middleware.js";

import validate from "../middlewares/validate.js";

import {
  createPurchaseItemSchema,
  updatePurchaseItemSchema,
} from "../validations/purchaseItem.validation.js";

const router = express.Router();


/*
|--------------------------------------------------------------------------
| Create Purchase Item
|--------------------------------------------------------------------------
*/

router.post(
  "/",
  protect,
  authorize("purchase-items.create"),
  validate(createPurchaseItemSchema),
  createPurchaseItem
);


/*
|--------------------------------------------------------------------------
| Get All Purchase Items
|--------------------------------------------------------------------------
|
| Supports:
| ?page=1
| ?limit=20
| ?purchase=...
| ?product=...
| ?productInventory=...
| ?search=iPhone
|
*/

router.get(
  "/",
  protect,
  authorize("purchase-items.read"),
  getAllPurchaseItems
);


/*
|--------------------------------------------------------------------------
| Get Items Of Specific Purchase
|--------------------------------------------------------------------------
|
| IMPORTANT:
| Keep this route BEFORE "/:id".
|
| GET /api/purchase-items/purchase/:purchaseId
|
*/

router.get(
  "/purchase/:purchaseId",
  protect,
  authorize("purchase-items.read"),
  getPurchaseItemsByPurchase
);


/*
|--------------------------------------------------------------------------
| Get Single Purchase Item
|--------------------------------------------------------------------------
*/

router.get(
  "/:id",
  protect,
  authorize("purchase-items.read"),
  getPurchaseItemById
);


/*
|--------------------------------------------------------------------------
| Update Purchase Item
|--------------------------------------------------------------------------
*/

router.patch(
  "/:id",
  protect,
  authorize("purchase-items.update"),
  validate(updatePurchaseItemSchema),
  updatePurchaseItem
);


/*
|--------------------------------------------------------------------------
| Delete Purchase Item
|--------------------------------------------------------------------------
*/

router.delete(
  "/:id",
  protect,
  authorize("purchase-items.delete"),
  deletePurchaseItem
);


export default router;