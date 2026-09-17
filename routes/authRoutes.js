import express from "express";

import {
    // =================================================
    // AUTH
    // =================================================
    signup,
    login,
    logout,

    // =================================================
    // PASSWORD RESET
    // =================================================
    forgotPassword,
    verifyOtp,
    resetPassword,

    // =================================================
    // USER
    // =================================================
    createUser,
    getMyProfile,
    getAllUsers,
    getUserById,
    updateUser,
    updateMyProfile,
    removeMyAvatar,
    deleteUser,

    // =================================================
    // MANAGER
    // =================================================
    createManager,
    getAllManagers,
    getManagerById,
} from "../controllers/authController.js";

import validate from "../middlewares/validate.js";

import {
    createUserSchema,
    updateUserSchema,
    loginUserSchema,
    forgotPasswordSchema,
    verifyOtpSchema,
    resetPasswordSchema,
} from "../validations/user.validation.js";

import {
    protect,
} from "../middlewares/auth.middleware.js";

import {
    authorize,
} from "../middlewares/permission.middleware.js";

import upload from "../middlewares/upload.middleware.js";

const router = express.Router();


// =====================================================
// =====================================================
// AUTH ROUTES
// =====================================================
// =====================================================


// =====================================================
// PUBLIC SIGNUP
// =====================================================
//
// Public users can register as ADMIN.
//
// Frontend sends:
// - name
// - email
// - phone
// - password
// - business
// - businessType
// - avatar
//
// Backend automatically sets:
// - role = admin
// - createdBy = null
// - status = pending
//
// Super Admin can later approve/reject/block
// the Admin account.
//
// IMPORTANT:
// Do not allow frontend to send role or createdBy.
// Controller ignores/controls these values.
// =====================================================

router.post(
    "/signup",
    upload.single("avatar"),
    signup
);


// =====================================================
// LOGIN
// =====================================================
//
// Public route.
//
// Login is allowed only when:
// - email/password are correct
// - user status = active
// - assigned role = active
// =====================================================

router.post(
    "/login",
    validate(loginUserSchema),
    login
);


// =====================================================
// LOGOUT
// =====================================================
//
// Cookie is cleared by controller.
// =====================================================

router.post(
    "/logout",
    logout
);


// =====================================================
// PASSWORD RESET ROUTES
// =====================================================


// -----------------------------------------------------
// FORGOT PASSWORD
// -----------------------------------------------------
//
// Sends password reset OTP to email.
// -----------------------------------------------------

router.post(
    "/forgot-password",
    validate(forgotPasswordSchema),
    forgotPassword
);


// -----------------------------------------------------
// VERIFY OTP
// -----------------------------------------------------
//
// Verifies OTP and returns temporary reset token.
// -----------------------------------------------------

router.post(
    "/verify-otp",
    validate(verifyOtpSchema),
    verifyOtp
);


// -----------------------------------------------------
// RESET PASSWORD
// -----------------------------------------------------
//
// Uses resetToken received after OTP verification.
// -----------------------------------------------------

router.post(
    "/reset-password",
    validate(resetPasswordSchema),
    resetPassword
);


// =====================================================
// =====================================================
// USERS ROUTES
// =====================================================
// =====================================================
//
// General user routes.
//
// IMPORTANT:
//
// GET /
//     Super Admin -> Admins only
//     Admin       -> Own Managers only
//     Manager     -> 403
//
// POST /
//     Super Admin -> Admin
//     Admin       -> Manager
//     Manager     -> 403
//
// GET /:id
//     Super Admin -> Admin + Admin's Managers
//     Admin       -> Own Manager
//     Manager     -> 403
//
// PATCH /:id
//     Super Admin -> Admin
//     Admin       -> Own Manager
//     Manager     -> 403
//
// DELETE /:id
//     Super Admin -> Admin
//     Admin       -> Own Manager
//     Manager     -> 403
//
// The controller performs the final role/ownership
// security checks.
// =====================================================


// =====================================================
// MY PROFILE
// =====================================================
//
// IMPORTANT:
// These routes MUST come before "/:id".
// Otherwise "/me" could be interpreted as an ID.
// =====================================================


// -----------------------------------------------------
// GET MY PROFILE
// -----------------------------------------------------

router.get(
    "/me",
    protect,
    getMyProfile
);


// -----------------------------------------------------
// UPDATE MY PROFILE
// -----------------------------------------------------
//
// Allowed:
// - name
// - phone
// - avatar
//
// Role/business/status/etc. cannot be changed here.
// -----------------------------------------------------

router.patch(
    "/me",
    protect,
    upload.single("avatar"),
    updateMyProfile
);


// -----------------------------------------------------
// REMOVE MY AVATAR
// -----------------------------------------------------

router.delete(
    "/me/avatar",
    protect,
    removeMyAvatar
);


// =====================================================
// CREATE USER
// =====================================================
//
// SUPER ADMIN:
//     Can create Admin.
//
// ADMIN:
//     Can create Manager.
//
// MANAGER:
//     Cannot create users.
//
// For Admin frontend, the dedicated
// POST /managers endpoint is preferred.
// =====================================================

router.post(
    "/",
    protect,
    authorize("users.create"),
    upload.single("avatar"),
    validate(createUserSchema),
    createUser
);


// =====================================================
// GET USERS
// =====================================================
//
// SUPER ADMIN:
//     Returns ONLY Admin users.
//
// ADMIN:
//     Returns ONLY Managers created by that Admin.
//
// MANAGER:
//     403
// =====================================================

router.get(
    "/",
    protect,
    authorize("users.read"),
    getAllUsers
);


// =====================================================
// =====================================================
// MANAGER ROUTES
// =====================================================
// =====================================================
//
// Dedicated Manager endpoints.
//
// IMPORTANT — ROUTE ORDER BUG FIX:
//
// These routes MUST be registered BEFORE the generic
// "/:id" routes below. Express matches routes top to
// bottom, and "/:id" is a single-segment wildcard, so
// GET "/managers" would otherwise be interpreted as
// GET "/:id" with id = "managers", producing:
//
//     CastError: Cast to ObjectId failed for value "managers"
//
// and a 400 "Invalid ID format" response to the frontend.
//
// ADMIN:
//     - create own Manager
//     - list own Managers
//     - view own Manager
//
// SUPER ADMIN:
//     - list all Managers
//     - view any Manager
//
// MANAGER:
//     - 403
//
// Manager business context is NOT duplicated.
//
// Manager:
//     createdBy -> Admin
//
// Admin:
//     business
//     businessType
//
// Therefore:
//
// Manager
//    ↓ createdBy
// Admin
//    ↓ business
// Business
//    ↓ businessType
// BusinessType
// =====================================================


// =====================================================
// CREATE MANAGER
// =====================================================
//
// ADMIN ONLY from controller.
//
// Frontend sends:
// - name
// - email
// - phone
// - password
// - avatar
//
// Backend automatically sets:
// - role = manager
// - business = null
// - businessType = null
// - createdBy = logged-in Admin
// - status = active
// - isEmailVerified = false
// =====================================================

router.post(
    "/managers",
    protect,
    authorize("users.create"),
    upload.single("avatar"),
    createManager
);


// =====================================================
// GET ALL MANAGERS
// =====================================================
//
// ADMIN:
//     Only managers created by logged-in Admin.
//
// SUPER ADMIN:
//     All managers.
//
// MANAGER:
//     403
// =====================================================

router.get(
    "/managers",
    protect,
    authorize("users.read"),
    getAllManagers
);


// =====================================================
// GET MANAGER BY ID
// =====================================================
//
// ADMIN:
//     Only own Manager.
//
// SUPER ADMIN:
//     Any Manager.
//
// MANAGER:
//     403
// =====================================================

router.get(
    "/managers/:id",
    protect,
    authorize("users.read"),
    getManagerById
);


// =====================================================
// GET USER BY ID
// =====================================================
//
// SUPER ADMIN:
//     Can view an Admin.
//     Response also contains:
//     - managers
//     - managerCount
//
// ADMIN:
//     Can view only his own Manager.
//
// MANAGER:
//     403
//
// IMPORTANT:
// This route MUST remain after "/me" AND after
// every "/managers..." route above.
// =====================================================

router.get(
    "/:id",
    protect,
    authorize("users.read"),
    getUserById
);


// =====================================================
// UPDATE USER
// =====================================================
//
// SUPER ADMIN:
//     Can update Admin:
//     - name
//     - email
//     - phone
//     - password
//     - avatar
//     - status
//     - email verification
//     - business
//     - business type
//
// ADMIN:
//     Can update OWN Manager:
//     - name
//     - email
//     - phone
//     - password
//     - avatar
//     - status
//     - email verification
//
// ADMIN CANNOT CHANGE:
//     - role
//     - business
//     - businessType
//     - createdBy
//
// MANAGER:
//     403
// =====================================================

router.patch(
    "/:id",
    protect,
    authorize("users.update"),
    upload.single("avatar"),
    validate(updateUserSchema),
    updateUser
);


// =====================================================
// DELETE USER
// =====================================================
//
// SUPER ADMIN:
//     Can delete Admin.
//
// ADMIN:
//     Can delete only own Manager.
//
// MANAGER:
//     403
// =====================================================

router.delete(
    "/:id",
    protect,
    authorize("users.delete"),
    deleteUser
);


// =====================================================
// EXPORT ROUTER
// =====================================================

export default router;