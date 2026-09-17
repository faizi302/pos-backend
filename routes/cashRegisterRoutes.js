import express from "express";

import {
  openCashRegister,
  getCurrentCashRegister,
  addCashIn,
  addCashOut,
  closeCashRegister,
  getAllCashRegisters,
  getCashRegisterById,
} from "../controllers/cashRegisterController.js";

import {protect} from "../middlewares/auth.middleware.js";

import { authorize } from "../middlewares/permission.middleware.js";

import validate from "../middlewares/validate.js";

import {
  openCashRegisterSchema,
  closeCashRegisterSchema,
  cashInSchema,
  cashOutSchema,
} from "../validations/cashRegister.validation.js";

const router = express.Router();

// Open register
router.post(
  "/open",
  protect,
  authorize("cash-registers.create"),
  validate(openCashRegisterSchema),
  openCashRegister
);

// Current open register
router.get(
  "/current",
  protect,
  authorize("cash-registers.read"),
  getCurrentCashRegister
);

// Cash In
router.post(
  "/cash-in",
  protect,
  authorize("cash-registers.update"),
  validate(cashInSchema),
  addCashIn
);

// Cash Out
router.post(
  "/cash-out",
  protect,
  authorize("cash-registers.update"),
  validate(cashOutSchema),
  addCashOut
);

// Close register
router.patch(
  "/close",
  protect,
  authorize("cash-registers.update"),
  validate(closeCashRegisterSchema),
  closeCashRegister
);

// Get all
router.get(
  "/",
  protect,
  authorize("cash-registers.read"),
  getAllCashRegisters
);

// Get by ID
router.get(
  "/:id",
  protect,
  authorize("cash-registers.read"),
  getCashRegisterById
);

export default router;