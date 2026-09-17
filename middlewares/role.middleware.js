// =====================================================
// ROLE AUTHORIZATION MIDDLEWARE
// =====================================================

import {
  errorResponse,
} from "../utils/apiResponse.js";

// =====================================================
// AUTHORIZE ROLES
// =====================================================

export const authorizeRoles = (...allowedRoles) => {
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
    // USER ROLE
    // =================================================

    const userRole = req.user.role.slug;

    // =================================================
    // CHECK ROLE
    // =================================================

    if (!allowedRoles.includes(userRole)) {
      return errorResponse(
        res,
        403,
        "You do not have permission to access this resource."
      );
    }

    // =================================================
    // CONTINUE
    // =================================================

    next();
  };
};