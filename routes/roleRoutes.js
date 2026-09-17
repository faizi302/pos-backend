import express from "express";

import {
  createRole,
  getAllRoles,
  getRoleById,
  updateRole,
  deleteRole,
  toggleRoleStatus,
} from "../controllers/roleController.js";

import { protect } from "../middlewares/auth.middleware.js";

import {
  authorizeRoles,
} from "../middlewares/role.middleware.js";

const router = express.Router();

// =====================================================
// ROLE MANAGEMENT
// SUPER ADMIN ONLY
// =====================================================

// Create Role
router.post(
  "/",
  protect,
  authorizeRoles("super-admin"),
  createRole
);

// Get All Roles
router.get(
  "/",
  protect,
  authorizeRoles("super-admin"),
  getAllRoles
);

// Get Role By ID
router.get(
  "/:id",
  protect,
  authorizeRoles("super-admin"),
  getRoleById
);

// Update Role
router.put(
  "/:id",
  protect,
  authorizeRoles("super-admin"),
  updateRole
);

// Delete Role
router.delete(
  "/:id",
  protect,
  authorizeRoles("super-admin"),
  deleteRole
);

// Toggle Role Status
router.patch(
  "/:id/toggle-status",
  protect,
  authorizeRoles("super-admin"),
  toggleRoleStatus
);

export default router;