import express from "express";

import {
  paypalWebhook,
} from "../controllers/paymentController.js";

const router = express.Router();

router.post(
  "/webhook",
  express.raw({
    type: "application/json",
  }),
  paypalWebhook
);

export default router;