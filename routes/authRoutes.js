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
    signupSchema,
    createUserSchema,
    createManagerSchema,
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
// MULTER FIELDS (avatar + logo)
// =====================================================

const uploadImages = upload.fields([
    { name: "avatar", maxCount: 1 },
    { name: "logo", maxCount: 1 },
]);

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
// Frontend can send:
// - name, email, phone, password, confirmPassword
// - country, city, address
// - business, businessType
// - avatar (file)
// - logo (file)  ← business logo for sidebar
//
// Backend automatically sets:
// - role = admin
// - createdBy = null
// - status = pending
//
// Super Admin later approves/rejects/blocks the account.
// =====================================================

router.post(
    "/signup",
    uploadImages,
    validate(signupSchema),
    signup
);


// =====================================================
// LOGIN
// =====================================================

router.post(
    "/login",
    validate(loginUserSchema),
    login
);


// =====================================================
// LOGOUT
// =====================================================

router.post(
    "/logout",
    logout
);


// =====================================================
// PASSWORD RESET ROUTES
// =====================================================

router.post(
    "/forgot-password",
    validate(forgotPasswordSchema),
    forgotPassword
);

router.post(
    "/verify-otp",
    validate(verifyOtpSchema),
    verifyOtp
);

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


// =====================================================
// MY PROFILE  (must be before /:id)
// =====================================================

router.get(
    "/me",
    protect,
    getMyProfile
);

router.patch(
    "/me",
    protect,
    uploadImages,
    updateMyProfile
);

router.delete(
    "/me/avatar",
    protect,
    removeMyAvatar
);


// =====================================================
// CREATE USER
// =====================================================
//
// SUPER ADMIN → Admin
// ADMIN       → Manager
// MANAGER     → 403
// =====================================================

router.post(
    "/",
    protect,
    authorize("users.create"),
    uploadImages,
    validate(createUserSchema),
    createUser
);


// =====================================================
// GET USERS
// =====================================================
//
// SUPER ADMIN → Admins only
// ADMIN       → Own Managers only
// MANAGER     → 403
// =====================================================

router.get(
    "/",
    protect,
    authorize("users.read"),
    getAllUsers
);


// =====================================================
// =====================================================
// MANAGER ROUTES  (must be before /:id)
// =====================================================
// =====================================================


// =====================================================
// CREATE MANAGER
// =====================================================
//
// ADMIN ONLY
// Frontend sends: name, email, phone, password,
//                 confirmPassword, country, city,
//                 address, avatar (optional)
// =====================================================

router.post(
    "/managers",
    protect,
    authorize("users.create"),
    uploadImages,
    validate(createManagerSchema),
    createManager
);


// =====================================================
// GET ALL MANAGERS
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
// Must stay after /me and /managers routes
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

router.patch(
    "/:id",
    protect,
    authorize("users.update"),
    uploadImages,
    validate(updateUserSchema),
    updateUser
);


// =====================================================
// DELETE USER
// =====================================================

router.delete(
    "/:id",
    protect,
    authorize("users.delete"),
    deleteUser
);


// =====================================================
// EXPORT
// =====================================================

export default router;