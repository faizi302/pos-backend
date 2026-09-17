// =====================================================
// PERMISSION AUTHORIZATION MIDDLEWARE
// =====================================================

import {
  errorResponse,
} from "../utils/apiResponse.js";

// =====================================================
// AUTHORIZE PERMISSION
// =====================================================

export const authorize = (...requiredPermissions) => {
  return (req, res, next) => {
    // =================================================
    // USER CHECK
    // =================================================

    if (!req.user) {
      return errorResponse(
        res,
        401,
        "Authentication required."
      );
    }

    // =================================================
    // ROLE CHECK
    // =================================================

    if (!req.user.role) {
      return errorResponse(
        res,
        403,
        "No role assigned to this user."
      );
    }

    // =================================================
    // PERMISSIONS
    // =================================================

    const userPermissions =
      req.user.role.permissions || [];

    // =================================================
    // ACTIVE PERMISSIONS ONLY
    // =================================================

    const activePermissions =
      userPermissions
        .filter((permission) => permission.isActive)
        .map((permission) => permission.name);

    // =================================================
    // CHECK PERMISSION
    // =================================================

    const hasPermission =
      requiredPermissions.every(
        (permission) =>
          activePermissions.includes(permission)
      );

    // =================================================
    // DENY ACCESS
    // =================================================

    if (!hasPermission) {
      return errorResponse(
        res,
        403,
        "You do not have permission to perform this action."
      );
    }

    // =================================================
    // CONTINUE
    // =================================================

    next();
  };
};