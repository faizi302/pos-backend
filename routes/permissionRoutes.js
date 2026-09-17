import express from "express";

import {
  createPermission,
  getAllPermissions,
  getPermissionById,
  updatePermission,
  deletePermission,
  togglePermissionStatus,
} from "../controllers/permissionController.js";

import { protect } from "../middlewares/auth.middleware.js";

import {
  authorizeRoles,
} from "../middlewares/role.middleware.js";

const router = express.Router();

// =====================================================
// PERMISSION MANAGEMENT
// SUPER ADMIN ONLY
// =====================================================

// Create Permission
router.post(
  "/",
  protect,
  authorizeRoles("super-admin"),
  createPermission
);

// Get All Permissions
router.get(
  "/",
  protect,
  authorizeRoles("super-admin"),
  getAllPermissions
);

// Get Permission By ID
router.get(
  "/:id",
  protect,
  authorizeRoles("super-admin"),
  getPermissionById
);

// Update Permission
router.put(
  "/:id",
  protect,
  authorizeRoles("super-admin"),
  updatePermission
);

// Delete Permission
router.delete(
  "/:id",
  protect,
  authorizeRoles("super-admin"),
  deletePermission
);

// Toggle Permission Status
router.patch(
  "/:id/toggle-status",
  protect,
  authorizeRoles("super-admin"),
  togglePermissionStatus
);

export default router;