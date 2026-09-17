import express from "express";

import {
  createPayment,
  capturePayment,
  getPaymentStatus,
  cancelPayment,
} from "../controllers/paymentController.js";

import {
  createPaymentSchema,
} from "../validations/payment.validation.js";

import {protect} from "../middlewares/auth.middleware.js";
import { authorize } from "../middlewares/permission.middleware.js";
import validate from "../middlewares/validate.js";

const router = express.Router();

router.post(
  "/create",
  protect,
  authorize("payments.create"),
  validate(createPaymentSchema),
  createPayment
);

router.post(
  "/:id/capture",
  protect,
  authorize("payments.create"),
  capturePayment
);

router.get(
  "/:id",
  protect,
  authorize("payments.read"),
  getPaymentStatus
);

router.post(
  "/:id/cancel",
  protect,
  authorize("payments.create"),
  cancelPayment
);

export default router;