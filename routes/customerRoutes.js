import express from "express";

import {
  createCustomer,
  getAllCustomers,
  getCustomerById,
  updateCustomer,
  deleteCustomer,
  restoreCustomer,
} from "../controllers/customerController.js";

import { protect } from "../middlewares/auth.middleware.js";
import { authorize } from "../middlewares/permission.middleware.js";

import validate from "../middlewares/validate.js";

import {
  createCustomerSchema,
  updateCustomerSchema,
} from "../validations/customer.validation.js";

const router = express.Router();

// ======================================================
// CREATE CUSTOMER
// POST /api/customers
// ======================================================

router.post(
  "/",
  protect,
  authorize("customers.create"),
  validate(createCustomerSchema),
  createCustomer
);

// ======================================================
// GET ALL CUSTOMERS
// GET /api/customers
// ======================================================

router.get(
  "/",
  protect,
  authorize("customers.read"),
  getAllCustomers
);

// ======================================================
// GET CUSTOMER BY ID
// GET /api/customers/:id
// ======================================================

router.get(
  "/:id",
  protect,
  authorize("customers.read"),
  getCustomerById
);

// ======================================================
// UPDATE CUSTOMER
// PATCH /api/customers/:id
// ======================================================

router.patch(
  "/:id",
  protect,
  authorize("customers.update"),
  validate(updateCustomerSchema),
  updateCustomer
);

// ======================================================
// DELETE CUSTOMER
// DELETE /api/customers/:id
// ======================================================

router.delete(
  "/:id",
  protect,
  authorize("customers.delete"),
  deleteCustomer
);

// ======================================================
// RESTORE CUSTOMER
// PATCH /api/customers/:id/restore
// ======================================================

router.patch(
  "/:id/restore",
  protect,
  authorize("customers.update"),
  restoreCustomer
);

export default router;