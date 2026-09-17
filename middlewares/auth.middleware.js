// =====================================================
// AUTH MIDDLEWARE
// =====================================================

import jwt from "jsonwebtoken";

import User from "../models/User.js";

import {
  errorResponse,
} from "../utils/apiResponse.js";

// =====================================================
// PROTECT
// Check JWT and get logged-in user
// =====================================================

export const protect = async (req, res, next) => {
  try {
    let token;

    // =================================================
    // 1. CHECK COOKIE
    // =================================================

    if (req.cookies?.token) {
      token = req.cookies.token;
    }

    // =================================================
    // 2. CHECK AUTHORIZATION HEADER
    // =================================================

    if (
      !token &&
      req.headers.authorization &&
      req.headers.authorization.startsWith("Bearer ")
    ) {
      token = req.headers.authorization.split(" ")[1];
    }

    // =================================================
    // 3. TOKEN NOT FOUND
    // =================================================

    if (!token) {
      return errorResponse(
        res,
        401,
        "Authentication required. Please login."
      );
    }

    // =================================================
    // 4. VERIFY TOKEN
    // =================================================

    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET
    );

    // =================================================
    // 5. FIND USER
    // =================================================

    const user = await User.findById(decoded.userId)
      .select("-password")
      .populate({
        path: "role",
        select: "name slug description permissions isActive",
        populate: {
          path: "permissions",
          select: "name resource action description isActive",
        },
      });

    // =================================================
    // 6. USER NOT FOUND
    // =================================================

    if (!user) {
      return errorResponse(
        res,
        401,
        "User no longer exists."
      );
    }

    // =================================================
    // 7. CHECK USER STATUS
    // =================================================

    if (user.status !== "active") {
      return errorResponse(
        res,
        403,
        `Your account is ${user.status}.`
      );
    }

    // =================================================
    // 8. CHECK ROLE
    // =================================================

    if (!user.role) {
      return errorResponse(
        res,
        403,
        "No role assigned to this user."
      );
    }

    // =================================================
    // 9. CHECK ROLE STATUS
    // =================================================

    if (!user.role.isActive) {
      return errorResponse(
        res,
        403,
        "Your assigned role is inactive."
      );
    }

    // =================================================
    // 10. ATTACH USER TO REQUEST
    // =================================================

    req.user = user;

    // =================================================
    // 11. CONTINUE
    // =================================================

    next();
  } catch (error) {
    // -------------------------------------------------
    // INVALID TOKEN
    // -------------------------------------------------

    if (error.name === "JsonWebTokenError") {
      return errorResponse(
        res,
        401,
        "Invalid authentication token."
      );
    }

    // -------------------------------------------------
    // EXPIRED TOKEN
    // -------------------------------------------------

    if (error.name === "TokenExpiredError") {
      return errorResponse(
        res,
        401,
        "Authentication token has expired. Please login again."
      );
    }

    next(error);
  }
};