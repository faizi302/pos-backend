import express from "express";

import {
  createStockMovement,
  getAllStockMovements,
  getStockMovementById,
  getMovementsByProduct,
} from "../controllers/stockMovementController.js";

import {protect}  from "../middlewares/auth.middleware.js";
import { authorize } from "../middlewares/permission.middleware.js";
import validate from "../middlewares/validate.js";

import {
  createStockMovementSchema,
} from "../validations/stockMovement.validation.js";

const router = express.Router();

/*
|--------------------------------------------------------------------------
| Create Stock Movement
|--------------------------------------------------------------------------
*/

router.post(
  "/",
  protect,
  authorize("stock-movements.create"),
  validate(createStockMovementSchema),
  createStockMovement
);

/*
|--------------------------------------------------------------------------
| Get All Stock Movements
|--------------------------------------------------------------------------
*/

router.get(
  "/",
  protect,
  authorize("stock-movements.read"),
  getAllStockMovements
);

/*
|--------------------------------------------------------------------------
| Get Movements By Product
|--------------------------------------------------------------------------
*/

router.get(
  "/product/:productId",
  protect,
  authorize("stock-movements.read"),
  getMovementsByProduct
);

/*
|--------------------------------------------------------------------------
| Get Stock Movement By ID
|--------------------------------------------------------------------------
*/

router.get(
  "/:id",
  protect,
  authorize("stock-movements.read"),
  getStockMovementById
);

export default router;