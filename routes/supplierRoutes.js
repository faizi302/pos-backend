import express from "express";

import {
  createSupplier,
  getAllSuppliers,
  getSupplierById,
  updateSupplier,
  deleteSupplier,
  restoreSupplier,
} from "../controllers/supplierController.js";

import { protect } from "../middlewares/auth.middleware.js";
import { authorize } from "../middlewares/permission.middleware.js";

import validate from "../middlewares/validate.js";

import {
  createSupplierSchema,
  updateSupplierSchema,
} from "../validations/supplier.validation.js";


const router = express.Router();


/*
|--------------------------------------------------------------------------
| Create Supplier
|--------------------------------------------------------------------------
*/

router.post(
  "/",
  protect,
  authorize("suppliers.create"),
  validate(createSupplierSchema),
  createSupplier
);


/*
|--------------------------------------------------------------------------
| Get All Suppliers
|--------------------------------------------------------------------------
|
| Supports:
|
| ?page=1
| ?limit=20
| ?search=ABC
| ?city=Lahore
| ?paymentTerms=30_days
| ?isActive=true
|
*/

router.get(
  "/",
  protect,
  authorize("suppliers.read"),
  getAllSuppliers
);


/*
|--------------------------------------------------------------------------
| Get Single Supplier
|--------------------------------------------------------------------------
*/

router.get(
  "/:id",
  protect,
  authorize("suppliers.read"),
  getSupplierById
);


/*
|--------------------------------------------------------------------------
| Update Supplier
|--------------------------------------------------------------------------
*/

router.patch(
  "/:id",
  protect,
  authorize("suppliers.update"),
  validate(updateSupplierSchema),
  updateSupplier
);


/*
|--------------------------------------------------------------------------
| Delete Supplier
|--------------------------------------------------------------------------
*/

router.delete(
  "/:id",
  protect,
  authorize("suppliers.delete"),
  deleteSupplier
);


/*
|--------------------------------------------------------------------------
| Restore Supplier
|--------------------------------------------------------------------------
*/

router.patch(
  "/:id/restore",
  protect,
  authorize("suppliers.update"),
  restoreSupplier
);


export default router;