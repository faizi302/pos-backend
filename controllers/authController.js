import bcrypt from "bcryptjs";
import crypto from "crypto";

import User from "../models/User.js";
import Role from "../models/Role.js";
import Business from "../models/Business.js";
import BusinessType from "../models/BusinessType.js";

import {
    successResponse,
    errorResponse,
} from "../utils/apiResponse.js";

import {
    generateToken,
    setAuthCookie,
} from "../utils/generateToken.js";

import {
    uploadToCloudinary,
    deleteFromCloudinary,
} from "../utils/cloudinaryUpload.js";

import sendEmail from "../utils/sendEmail.js";


// =====================================================
// CONSTANTS
// =====================================================

const USER_STATUSES = [
    "active",
    "pending",
    "rejected",
    "suspended",
];


// =====================================================
// HELPER
// GET AUTHENTICATED USER ROLE SLUG
// =====================================================

const getAuthenticatedRoleSlug = async (user) => {
    if (!user) {
        return null;
    }

    // Role already populated
    if (
        user.role &&
        typeof user.role === "object" &&
        user.role.slug
    ) {
        return user.role.slug.toLowerCase();
    }

    // Role is ObjectId
    if (user.role) {
        const role = await Role.findById(user.role)
            .select("slug");

        return role?.slug?.toLowerCase() || null;
    }

    return null;
};


// =====================================================
// HELPER
// GET ROLE BY SLUG
// =====================================================

const getRoleBySlug = async (slug) => {
    return await Role.findOne({
        slug: slug.toLowerCase(),
        isActive: true,
    });
};


// =====================================================
// HELPER
// VALIDATE STATUS
// =====================================================

const isValidStatus = (status) => {
    return USER_STATUSES.includes(status);
};


// =====================================================
// HELPER
// POPULATE USER
// =====================================================

const populateUser = async (user) => {
    await user.populate([
        {
            path: "role",
            select: "name slug permissions isActive",
            populate: {
                path: "permissions",
                select: "name resource action isActive",
            },
        },
        {
            path: "business",
            select: "name",
        },
        {
            path: "businessType",
            select: "name business",
        },
        {
            path: "createdBy",
            select: "name email business businessType",
            populate: [
                {
                    path: "business",
                    select: "name",
                },
                {
                    path: "businessType",
                    select: "name",
                },
            ],
        },
    ]);

    return user;
};


// =====================================================
// HELPER
// SAFE USER RESPONSE
// =====================================================

const getSafeUserResponse = (user) => {
    const userResponse = user.toObject();

    delete userResponse.password;
    delete userResponse.resetOtp;
    delete userResponse.resetOtpExpiresAt;
    delete userResponse.resetOtpAttempts;
    delete userResponse.resetToken;
    delete userResponse.resetTokenExpiresAt;

    return userResponse;
};


// =====================================================
// HELPER
// UPLOAD USER AVATAR
// =====================================================

const uploadUserAvatar = async (file) => {
    if (!file) {
        return null;
    }

    const uploadedImage = await uploadToCloudinary(
        file.buffer,
        "pos/users"
    );

    return {
        url: uploadedImage.secure_url,
        publicId: uploadedImage.public_id,
    };
};


// =====================================================
// HELPER
// DELETE AVATAR SAFELY
// =====================================================

const deleteUserAvatar = async (user) => {
    if (!user?.avatar?.publicId) {
        return;
    }

    try {
        await deleteFromCloudinary(
            user.avatar.publicId
        );
    } catch (error) {
        console.error(
            "Failed to delete user avatar:",
            error
        );
    }
};


// =====================================================
// HELPER
// CHECK EMAIL
// =====================================================

const normalizeEmail = (email) => {
    return email?.trim().toLowerCase();
};


// =====================================================
// HELPER
// CHECK DUPLICATE EMAIL
// =====================================================

const emailExists = async (email, excludedUserId = null) => {
    const filter = {
        email: normalizeEmail(email),
    };

    if (excludedUserId) {
        filter._id = {
            $ne: excludedUserId,
        };
    }

    return await User.findOne(filter);
};


// =====================================================
// HELPER
// VALIDATE BUSINESS
// =====================================================

const validateBusiness = async (businessId) => {
    if (!businessId) {
        return null;
    }

    const business = await Business.findById(
        businessId
    );

    if (!business) {
        return {
            error: "Selected business not found",
        };
    }

    if (!business.isActive) {
        return {
            error: "Selected business is inactive",
        };
    }

    return {
        business,
    };
};


// =====================================================
// HELPER
// VALIDATE BUSINESS TYPE
// =====================================================

const validateBusinessType = async (
    businessTypeId,
    businessId
) => {
    if (!businessTypeId) {
        return null;
    }

    if (!businessId) {
        return {
            error:
                "Business is required when Business Type is provided",
        };
    }

    const businessType =
        await BusinessType.findOne({
            _id: businessTypeId,
            business: businessId,
        });

    if (!businessType) {
        return {
            error:
                "Selected business type not found or does not belong to the selected business",
        };
    }

    if (!businessType.isActive) {
        return {
            error:
                "Selected business type is inactive",
        };
    }

    return {
        businessType,
    };
};


// =====================================================
// PUBLIC SIGNUP
// =====================================================
//
// PUBLIC SIGNUP = ADMIN
//
// Frontend does NOT control:
// - role
// - createdBy
//
// Business + BusinessType are optional.
//
// IMPORTANT:
// Public Admin signup starts as PENDING so that
// Super Admin can approve the account.
//
// If you want instant Admin activation instead,
// change status to "active" below.
// =====================================================

export const signup = async (req, res, next) => {
    try {
        const {
            name,
            email,
            phone,
            password,
            business,
            businessType,
        } = req.body;

        const normalizedEmail =
            normalizeEmail(email);

        // -------------------------------------------------
        // DUPLICATE EMAIL
        // -------------------------------------------------

        const existingUser =
            await User.findOne({
                email: normalizedEmail,
            });

        if (existingUser) {
            return errorResponse(
                res,
                409,
                "User with this email already exists"
            );
        }

        // -------------------------------------------------
        // ADMIN ROLE
        // -------------------------------------------------

        const adminRole =
            await getRoleBySlug("admin");

        if (!adminRole) {
            return errorResponse(
                res,
                500,
                "Admin role is not configured"
            );
        }

        // -------------------------------------------------
        // VALIDATE BUSINESS
        // -------------------------------------------------

        let validatedBusiness = null;

        if (business) {
            const result =
                await validateBusiness(business);

            if (result?.error) {
                return errorResponse(
                    res,
                    400,
                    result.error
                );
            }

            validatedBusiness =
                result.business._id;
        }

        // -------------------------------------------------
        // VALIDATE BUSINESS TYPE
        // -------------------------------------------------

        let validatedBusinessType = null;

        if (businessType) {
            const result =
                await validateBusinessType(
                    businessType,
                    validatedBusiness
                );

            if (result?.error) {
                return errorResponse(
                    res,
                    400,
                    result.error
                );
            }

            validatedBusinessType =
                result.businessType._id;
        }

        // -------------------------------------------------
        // HASH PASSWORD
        // -------------------------------------------------

        const hashedPassword =
            await bcrypt.hash(password, 12);

        // -------------------------------------------------
        // AVATAR
        // -------------------------------------------------

        let avatar = null;

        if (req.file) {
            avatar =
                await uploadUserAvatar(req.file);
        }

        // -------------------------------------------------
        // CREATE ADMIN
        // -------------------------------------------------

        const user = await User.create({
            name,
            email: normalizedEmail,
            phone,
            password: hashedPassword,

            role: adminRole._id,

            business: validatedBusiness,

            businessType:
                validatedBusinessType,

            createdBy: null,

            // Admin requires Super Admin approval
            status: "pending",

            isEmailVerified: false,

            avatar,
        });

        await populateUser(user);

        return successResponse(
            res,
            201,
            "Account created successfully. Your account is pending approval.",
            getSafeUserResponse(user)
        );

    } catch (error) {
        next(error);
    }
};


// =====================================================
// CREATE USER
// =====================================================
//
// INTERNAL CREATION
//
// SUPER ADMIN:
// → creates ADMIN only
//
// ADMIN:
// → creates MANAGER only
//
// MANAGER:
// → cannot create users
//
// Dedicated manager endpoint is preferred for Admin:
// POST /api/users/managers
// =====================================================

export const createUser = async (
    req,
    res,
    next
) => {
    try {
        const {
            name,
            email,
            phone,
            password,
            role,
            business,
            businessType,
            status,
            isEmailVerified,
        } = req.body;

        const creatorSlug =
            await getAuthenticatedRoleSlug(
                req.user
            );

        if (!creatorSlug) {
            return errorResponse(
                res,
                403,
                "Unable to determine your role"
            );
        }

        const normalizedEmail =
            normalizeEmail(email);

        // -------------------------------------------------
        // DUPLICATE EMAIL
        // -------------------------------------------------

        const existingUser =
            await emailExists(normalizedEmail);

        if (existingUser) {
            return errorResponse(
                res,
                409,
                "User with this email already exists"
            );
        }

        // =================================================
        // ADMIN CREATES MANAGER
        // =================================================

        if (creatorSlug === "admin") {
            const managerRole =
                await getRoleBySlug("manager");

            if (!managerRole) {
                return errorResponse(
                    res,
                    500,
                    "Manager role is not configured"
                );
            }

            // Admin cannot create another role
            if (
                role !== undefined &&
                role !== managerRole._id.toString()
            ) {
                return errorResponse(
                    res,
                    403,
                    "Admin can only create Manager users"
                );
            }

            // Admin cannot assign business manually
            if (
                business !== undefined ||
                businessType !== undefined
            ) {
                return errorResponse(
                    res,
                    403,
                    "Business information is managed by the Admin account"
                );
            }

            // Validate status if supplied
            if (
                status !== undefined &&
                !isValidStatus(status)
            ) {
                return errorResponse(
                    res,
                    400,
                    "Invalid user status"
                );
            }

            const hashedPassword =
                await bcrypt.hash(
                    password,
                    12
                );

            let avatar = null;

            if (req.file) {
                avatar =
                    await uploadUserAvatar(
                        req.file
                    );
            }

            const manager =
                await User.create({
                    name,
                    email: normalizedEmail,
                    phone,
                    password: hashedPassword,

                    role: managerRole._id,

                    // Manager inherits business context
                    // through createdBy Admin.
                    business: null,
                    businessType: null,

                    createdBy:
                        req.user._id,

                    status:
                        status || "active",

                    isEmailVerified:
                        isEmailVerified ??
                        false,

                    avatar,
                });

            await populateUser(manager);

            return successResponse(
                res,
                201,
                "Manager created successfully",
                getSafeUserResponse(manager)
            );
        }

        // =================================================
        // SUPER ADMIN CREATES ADMIN
        // =================================================

        if (creatorSlug === "super-admin") {
            const adminRole =
                await getRoleBySlug("admin");

            if (!adminRole) {
                return errorResponse(
                    res,
                    500,
                    "Admin role is not configured"
                );
            }

            // Generic Super Admin user creation is
            // restricted to Admin.
            if (
                role !== undefined &&
                role !== adminRole._id.toString()
            ) {
                return errorResponse(
                    res,
                    403,
                    "Super Admin can create Admin users through this endpoint"
                );
            }

            if (
                status !== undefined &&
                !isValidStatus(status)
            ) {
                return errorResponse(
                    res,
                    400,
                    "Invalid user status"
                );
            }

            // -------------------------------------------------
            // BUSINESS
            // -------------------------------------------------

            let validatedBusiness = null;

            if (business) {
                const result =
                    await validateBusiness(
                        business
                    );

                if (result?.error) {
                    return errorResponse(
                        res,
                        400,
                        result.error
                    );
                }

                validatedBusiness =
                    result.business._id;
            }

            // -------------------------------------------------
            // BUSINESS TYPE
            // -------------------------------------------------

            let validatedBusinessType =
                null;

            if (businessType) {
                const result =
                    await validateBusinessType(
                        businessType,
                        validatedBusiness
                    );

                if (result?.error) {
                    return errorResponse(
                        res,
                        400,
                        result.error
                    );
                }

                validatedBusinessType =
                    result.businessType._id;
            }

            const hashedPassword =
                await bcrypt.hash(
                    password,
                    12
                );

            let avatar = null;

            if (req.file) {
                avatar =
                    await uploadUserAvatar(
                        req.file
                    );
            }

            const user =
                await User.create({
                    name,
                    email: normalizedEmail,
                    phone,
                    password: hashedPassword,

                    role: adminRole._id,

                    business:
                        validatedBusiness,

                    businessType:
                        validatedBusinessType,

                    createdBy: null,

                    status:
                        status || "active",

                    isEmailVerified:
                        isEmailVerified ??
                        false,

                    avatar,
                });

            await populateUser(user);

            return successResponse(
                res,
                201,
                "Admin created successfully",
                getSafeUserResponse(user)
            );
        }

        // =================================================
        // MANAGER
        // =================================================

        return errorResponse(
            res,
            403,
            "Managers are not allowed to create users"
        );

    } catch (error) {
        next(error);
    }
};


// =====================================================
// CREATE MANAGER
// =====================================================
//
// ADMIN ONLY
//
// POST /api/users/managers
//
// Business information is inherited through:
// Manager → createdBy → Admin → Business
// =====================================================

export const createManager = async (
    req,
    res,
    next
) => {
    try {
        const {
            name,
            email,
            phone,
            password,
        } = req.body;

        // -------------------------------------------------
        // ROLE
        // -------------------------------------------------

        const creatorSlug =
            await getAuthenticatedRoleSlug(
                req.user
            );

        if (creatorSlug !== "admin") {
            return errorResponse(
                res,
                403,
                "Only Admin can create managers"
            );
        }

        const normalizedEmail =
            normalizeEmail(email);

        // -------------------------------------------------
        // DUPLICATE EMAIL
        // -------------------------------------------------

        const existingUser =
            await emailExists(
                normalizedEmail
            );

        if (existingUser) {
            return errorResponse(
                res,
                409,
                "User with this email already exists"
            );
        }

        // -------------------------------------------------
        // MANAGER ROLE
        // -------------------------------------------------

        const managerRole =
            await getRoleBySlug("manager");

        if (!managerRole) {
            return errorResponse(
                res,
                500,
                "Manager role is not configured"
            );
        }

        // -------------------------------------------------
        // PASSWORD
        // -------------------------------------------------

        const hashedPassword =
            await bcrypt.hash(
                password,
                12
            );

        // -------------------------------------------------
        // AVATAR
        // -------------------------------------------------

        let avatar = null;

        if (req.file) {
            avatar =
                await uploadUserAvatar(
                    req.file
                );
        }

        // -------------------------------------------------
        // CREATE MANAGER
        // -------------------------------------------------

        const manager =
            await User.create({
                name,
                email: normalizedEmail,
                phone,
                password: hashedPassword,

                role: managerRole._id,

                business: null,
                businessType: null,

                createdBy:
                    req.user._id,

                status: "active",

                isEmailVerified: false,

                avatar,
            });

        await populateUser(manager);

        return successResponse(
            res,
            201,
            "Manager created successfully",
            getSafeUserResponse(manager)
        );

    } catch (error) {
        next(error);
    }
};


// =====================================================
// GET ALL USERS
// =====================================================
//
// SUPER ADMIN:
// → ONLY ADMINS
//
// ADMIN:
// → ONLY HIS MANAGERS
//
// MANAGER:
// → NOT ALLOWED
// =====================================================

export const getAllUsers = async (
    req,
    res,
    next
) => {
    try {
        const creatorSlug =
            await getAuthenticatedRoleSlug(
                req.user
            );

        // =================================================
        // SUPER ADMIN → ADMINS ONLY
        // =================================================

        if (creatorSlug === "super-admin") {
            const adminRole =
                await getRoleBySlug("admin");

            if (!adminRole) {
                return errorResponse(
                    res,
                    500,
                    "Admin role is not configured"
                );
            }

            const admins =
                await User.find({
                    role: adminRole._id,
                })
                    .select("-password")
                    .populate([
                        {
                            path: "role",
                            select:
                                "name slug permissions isActive",
                            populate: {
                                path: "permissions",
                                select:
                                    "name resource action isActive",
                            },
                        },
                        {
                            path: "business",
                            select: "name",
                        },
                        {
                            path: "businessType",
                            select:
                                "name business",
                        },
                    ])
                    .sort({
                        createdAt: -1,
                    });

            return successResponse(
                res,
                200,
                "Admins fetched successfully",
                admins.map(
                    getSafeUserResponse
                )
            );
        }

        // =================================================
        // ADMIN → OWN MANAGERS ONLY
        // =================================================

        if (creatorSlug === "admin") {
            const managerRole =
                await getRoleBySlug("manager");

            if (!managerRole) {
                return errorResponse(
                    res,
                    500,
                    "Manager role is not configured"
                );
            }

            const managers =
                await User.find({
                    role: managerRole._id,
                    createdBy:
                        req.user._id,
                })
                    .select("-password")
                    .populate([
                        {
                            path: "role",
                            select:
                                "name slug permissions isActive",
                            populate: {
                                path: "permissions",
                                select:
                                    "name resource action isActive",
                            },
                        },
                        {
                            path: "createdBy",
                            select:
                                "name email business businessType",
                            populate: [
                                {
                                    path: "business",
                                    select: "name",
                                },
                                {
                                    path: "businessType",
                                    select:
                                        "name",
                                },
                            ],
                        },
                    ])
                    .sort({
                        createdAt: -1,
                    });

            return successResponse(
                res,
                200,
                "Managers fetched successfully",
                managers.map(
                    getSafeUserResponse
                )
            );
        }

        // =================================================
        // MANAGER
        // =================================================

        return errorResponse(
            res,
            403,
            "You are not allowed to view users"
        );

    } catch (error) {
        next(error);
    }
};


// =====================================================
// GET MY PROFILE
// =====================================================

export const getMyProfile = async (
    req,
    res,
    next
) => {
    try {
        const user =
            await User.findById(
                req.user._id
            ).select("-password");

        if (!user) {
            return errorResponse(
                res,
                404,
                "User not found"
            );
        }

        await populateUser(user);

        return successResponse(
            res,
            200,
            "Current user fetched successfully",
            getSafeUserResponse(user)
        );

    } catch (error) {
        next(error);
    }
};


// =====================================================
// GET USER BY ID
// =====================================================
//
// SUPER ADMIN:
// → ONLY ADMINS
// → ALSO RETURNS THAT ADMIN'S MANAGERS
//
// ADMIN:
// → ONLY OWN MANAGER
//
// MANAGER:
// → NOT ALLOWED
// =====================================================

export const getUserById = async (
    req,
    res,
    next
) => {
    try {
        const { id } = req.params;

        const creatorSlug =
            await getAuthenticatedRoleSlug(
                req.user
            );

        // =================================================
        // SUPER ADMIN → ADMIN DETAILS
        // =================================================

        if (creatorSlug === "super-admin") {
            const adminRole =
                await getRoleBySlug("admin");

            const managerRole =
                await getRoleBySlug("manager");

            if (!adminRole || !managerRole) {
                return errorResponse(
                    res,
                    500,
                    "Required roles are not configured"
                );
            }

            const admin =
                await User.findOne({
                    _id: id,
                    role: adminRole._id,
                }).select("-password");

            if (!admin) {
                return errorResponse(
                    res,
                    404,
                    "Admin not found"
                );
            }

            await populateUser(admin);

            // -------------------------------------------------
            // GET ADMIN'S MANAGERS
            // -------------------------------------------------

            const managers =
                await User.find({
                    role: managerRole._id,
                    createdBy: admin._id,
                })
                    .select("-password")
                    .populate([
                        {
                            path: "role",
                            select:
                                "name slug permissions isActive",
                            populate: {
                                path: "permissions",
                                select:
                                    "name resource action isActive",
                            },
                        },
                        {
                            path: "createdBy",
                            select:
                                "name email business businessType",
                            populate: [
                                {
                                    path: "business",
                                    select:
                                        "name",
                                },
                                {
                                    path: "businessType",
                                    select:
                                        "name",
                                },
                            ],
                        },
                    ])
                    .sort({
                        createdAt: -1,
                    });

            const adminResponse =
                getSafeUserResponse(admin);

            adminResponse.managers =
                managers.map(
                    getSafeUserResponse
                );

            adminResponse.managerCount =
                managers.length;

            return successResponse(
                res,
                200,
                "Admin details fetched successfully",
                adminResponse
            );
        }

        // =================================================
        // ADMIN → OWN MANAGER
        // =================================================

        if (creatorSlug === "admin") {
            const managerRole =
                await getRoleBySlug("manager");

            if (!managerRole) {
                return errorResponse(
                    res,
                    500,
                    "Manager role is not configured"
                );
            }

            const manager =
                await User.findOne({
                    _id: id,
                    role: managerRole._id,
                    createdBy:
                        req.user._id,
                }).select("-password");

            if (!manager) {
                return errorResponse(
                    res,
                    404,
                    "Manager not found"
                );
            }

            await populateUser(manager);

            return successResponse(
                res,
                200,
                "Manager fetched successfully",
                getSafeUserResponse(manager)
            );
        }

        // =================================================
        // MANAGER
        // =================================================

        return errorResponse(
            res,
            403,
            "You are not allowed to view this user"
        );

    } catch (error) {
        next(error);
    }
};


// =====================================================
// GET ALL MANAGERS
// =====================================================
//
// SUPER ADMIN:
// → ALL MANAGERS
//
// ADMIN:
// → ONLY HIS MANAGERS
//
// MANAGER:
// → NOT ALLOWED
// =====================================================

export const getAllManagers = async (
    req,
    res,
    next
) => {
    try {
        const creatorSlug =
            await getAuthenticatedRoleSlug(
                req.user
            );

        const managerRole =
            await getRoleBySlug("manager");

        if (!managerRole) {
            return errorResponse(
                res,
                500,
                "Manager role is not configured"
            );
        }

        let filter = {
            role: managerRole._id,
        };

        // Admin → own managers
        if (creatorSlug === "admin") {
            filter.createdBy =
                req.user._id;
        }

        // Super Admin → all managers
        else if (
            creatorSlug === "super-admin"
        ) {
            // No ownership filter
        }

        // Manager → forbidden
        else {
            return errorResponse(
                res,
                403,
                "You are not allowed to view managers"
            );
        }

        const managers =
            await User.find(filter)
                .select("-password")
                .populate([
                    {
                        path: "role",
                        select:
                            "name slug permissions isActive",
                        populate: {
                            path: "permissions",
                            select:
                                "name resource action isActive",
                        },
                    },
                    {
                        path: "createdBy",
                        select:
                            "name email business businessType",
                        populate: [
                            {
                                path: "business",
                                select:
                                    "name",
                            },
                            {
                                path: "businessType",
                                select:
                                    "name",
                            },
                        ],
                    },
                ])
                .sort({
                    createdAt: -1,
                });

        return successResponse(
            res,
            200,
            "Managers fetched successfully",
            managers.map(
                getSafeUserResponse
            )
        );

    } catch (error) {
        next(error);
    }
};


// =====================================================
// GET MANAGER BY ID
// =====================================================
//
// SUPER ADMIN:
// → ANY MANAGER
//
// ADMIN:
// → ONLY HIS MANAGER
//
// MANAGER:
// → NOT ALLOWED
// =====================================================

export const getManagerById = async (
    req,
    res,
    next
) => {
    try {
        const { id } = req.params;

        const creatorSlug =
            await getAuthenticatedRoleSlug(
                req.user
            );

        const managerRole =
            await getRoleBySlug("manager");

        if (!managerRole) {
            return errorResponse(
                res,
                500,
                "Manager role is not configured"
            );
        }

        const filter = {
            _id: id,
            role: managerRole._id,
        };

        // Admin → own manager only
        if (creatorSlug === "admin") {
            filter.createdBy =
                req.user._id;
        }

        // Super Admin → any manager
        else if (
            creatorSlug === "super-admin"
        ) {
            // No ownership restriction
        }

        else {
            return errorResponse(
                res,
                403,
                "You are not allowed to view managers"
            );
        }

        const manager =
            await User.findOne(filter)
                .select("-password");

        if (!manager) {
            return errorResponse(
                res,
                404,
                "Manager not found"
            );
        }

        await populateUser(manager);

        return successResponse(
            res,
            200,
            "Manager fetched successfully",
            getSafeUserResponse(manager)
        );

    } catch (error) {
        next(error);
    }
};


// =====================================================
// UPDATE USER
// =====================================================
//
// SUPER ADMIN:
// → updates ADMINS only
//
// ADMIN:
// → updates OWN MANAGERS only
//
// IMPORTANT:
// Generic user update does NOT allow role changing.
//
// Admin:
// - cannot change role
// - cannot change business
// - cannot change businessType
// - cannot change createdBy
//
// Super Admin:
// - can update Admin business
// - can update Admin businessType
// - can update Admin status
// - cannot change Admin role through this endpoint
// =====================================================

export const updateUser = async (
    req,
    res,
    next
) => {
    try {
        const { id } = req.params;

        const {
            name,
            email,
            phone,
            password,
            role,
            business,
            businessType,
            status,
            isEmailVerified,
        } = req.body;

        const creatorSlug =
            await getAuthenticatedRoleSlug(
                req.user
            );

        // -------------------------------------------------
        // FIND USER
        // -------------------------------------------------

        const user =
            await User.findById(id)
                .select("+password");

        if (!user) {
            return errorResponse(
                res,
                404,
                "User not found"
            );
        }

        // =================================================
        // ADMIN → MANAGER ONLY
        // =================================================

        if (creatorSlug === "admin") {
            const managerRole =
                await getRoleBySlug("manager");

            if (!managerRole) {
                return errorResponse(
                    res,
                    500,
                    "Manager role is not configured"
                );
            }

            const isOwnManager =
                user.role?.toString() ===
                    managerRole._id.toString() &&
                user.createdBy?.toString() ===
                    req.user._id.toString();

            if (!isOwnManager) {
                return errorResponse(
                    res,
                    403,
                    "You are not allowed to update this user"
                );
            }

            // -------------------------------------------------
            // ADMIN CANNOT CHANGE ROLE/BUSINESS
            // -------------------------------------------------

            if (
                role !== undefined ||
                business !== undefined ||
                businessType !== undefined
            ) {
                return errorResponse(
                    res,
                    403,
                    "Admin cannot change manager role or business information"
                );
            }
        }

        // =================================================
        // SUPER ADMIN → ADMIN ONLY
        // =================================================

        else if (
            creatorSlug === "super-admin"
        ) {
            const adminRole =
                await getRoleBySlug("admin");

            if (!adminRole) {
                return errorResponse(
                    res,
                    500,
                    "Admin role is not configured"
                );
            }

            const isAdmin =
                user.role?.toString() ===
                adminRole._id.toString();

            if (!isAdmin) {
                return errorResponse(
                    res,
                    403,
                    "Super Admin can only update Admin users from this endpoint"
                );
            }

            // -------------------------------------------------
            // ROLE CANNOT BE CHANGED
            // -------------------------------------------------

            if (
                role !== undefined &&
                role !== null &&
                role.toString() !==
                    user.role.toString()
            ) {
                return errorResponse(
                    res,
                    403,
                    "Admin role cannot be changed from this endpoint"
                );
            }
        }

        // =================================================
        // MANAGER
        // =================================================

        else {
            return errorResponse(
                res,
                403,
                "You are not allowed to update users"
            );
        }

        // =================================================
        // STATUS
        // =================================================

        if (status !== undefined) {
            if (!isValidStatus(status)) {
                return errorResponse(
                    res,
                    400,
                    "Invalid user status"
                );
            }

            user.status = status;
        }

        // =================================================
        // EMAIL
        // =================================================

        if (email !== undefined) {
            const normalizedEmail =
                normalizeEmail(email);

            if (
                normalizedEmail !==
                user.email
            ) {
                const existingUser =
                    await emailExists(
                        normalizedEmail,
                        id
                    );

                if (existingUser) {
                    return errorResponse(
                        res,
                        409,
                        "Another user already uses this email"
                    );
                }

                user.email =
                    normalizedEmail;

                // Email should be verified again
                // after changing email.
                user.isEmailVerified =
                    false;
            }
        }

        // =================================================
        // BASIC FIELDS
        // =================================================

        if (name !== undefined) {
            user.name = name;
        }

        if (phone !== undefined) {
            user.phone = phone;
        }

        if (
            isEmailVerified !== undefined
        ) {
            user.isEmailVerified =
                isEmailVerified;
        }

        // =================================================
        // SUPER ADMIN → BUSINESS
        // =================================================

        if (
            creatorSlug === "super-admin" &&
            business !== undefined
        ) {
            // Remove business
            if (
                business === null ||
                business === ""
            ) {
                user.business = null;

                // Business Type cannot exist
                // without Business.
                user.businessType = null;
            }

            // Change business
            else {
                const result =
                    await validateBusiness(
                        business
                    );

                if (result?.error) {
                    return errorResponse(
                        res,
                        400,
                        result.error
                    );
                }

                const newBusinessId =
                    result.business._id;

                const businessChanged =
                    user.business?.toString() !==
                    newBusinessId.toString();

                user.business =
                    newBusinessId;

                // If business changed and no
                // new businessType was supplied,
                // old businessType is no longer valid.
                if (
                    businessChanged &&
                    businessType === undefined
                ) {
                    user.businessType =
                        null;
                }
            }
        }

        // =================================================
        // SUPER ADMIN → BUSINESS TYPE
        // =================================================

        if (
            creatorSlug === "super-admin" &&
            businessType !== undefined
        ) {
            // Remove business type
            if (
                businessType === null ||
                businessType === ""
            ) {
                user.businessType = null;
            }

            // Assign business type
            else {
                if (!user.business) {
                    return errorResponse(
                        res,
                        400,
                        "Business is required when Business Type is provided"
                    );
                }

                const result =
                    await validateBusinessType(
                        businessType,
                        user.business
                    );

                if (result?.error) {
                    return errorResponse(
                        res,
                        400,
                        result.error
                    );
                }

                user.businessType =
                    result.businessType._id;
            }
        }

        // =================================================
        // PASSWORD
        // =================================================

        if (
            password !== undefined &&
            password.trim()
        ) {
            user.password =
                await bcrypt.hash(
                    password,
                    12
                );
        }

        // =================================================
        // AVATAR
        // =================================================

        if (req.file) {
            const oldAvatar =
                user.avatar;

            const newAvatar =
                await uploadUserAvatar(
                    req.file
                );

            user.avatar =
                newAvatar;

            if (oldAvatar?.publicId) {
                try {
                    await deleteFromCloudinary(
                        oldAvatar.publicId
                    );
                } catch (cloudinaryError) {
                    console.error(
                        "Failed to delete old avatar:",
                        cloudinaryError
                    );
                }
            }
        }

        // =================================================
        // SAVE
        // =================================================

        await user.save();

        await populateUser(user);

        return successResponse(
            res,
            200,
            "User updated successfully",
            getSafeUserResponse(user)
        );

    } catch (error) {
        next(error);
    }
};


// =====================================================
// UPDATE MY PROFILE
// =====================================================
//
// Every authenticated role can update:
// - name
// - phone
// - avatar
//
// Role/business/status/email/password are NOT changed here.
// =====================================================

export const updateMyProfile = async (
    req,
    res,
    next
) => {
    try {
        const user =
            await User.findById(
                req.user._id
            ).select("+password");

        if (!user) {
            return errorResponse(
                res,
                404,
                "User not found"
            );
        }

        const {
            name,
            phone,
        } = req.body;

        // -------------------------------------------------
        // BASIC
        // -------------------------------------------------

        if (name !== undefined) {
            user.name = name;
        }

        if (phone !== undefined) {
            user.phone = phone;
        }

        // -------------------------------------------------
        // AVATAR
        // -------------------------------------------------

        if (req.file) {
            const oldAvatar =
                user.avatar;

            const newAvatar =
                await uploadUserAvatar(
                    req.file
                );

            user.avatar =
                newAvatar;

            if (oldAvatar?.publicId) {
                try {
                    await deleteFromCloudinary(
                        oldAvatar.publicId
                    );
                } catch (cloudinaryError) {
                    console.error(
                        "Failed to delete old avatar:",
                        cloudinaryError
                    );
                }
            }
        }

        await user.save();

        await populateUser(user);

        return successResponse(
            res,
            200,
            "Profile updated successfully",
            getSafeUserResponse(user)
        );

    } catch (error) {
        next(error);
    }
};


// =====================================================
// REMOVE MY AVATAR
// =====================================================

export const removeMyAvatar = async (
    req,
    res,
    next
) => {
    try {
        const user =
            await User.findById(
                req.user._id
            );

        if (!user) {
            return errorResponse(
                res,
                404,
                "User not found"
            );
        }

        if (!user.avatar?.publicId) {
            return successResponse(
                res,
                200,
                "No profile image to remove"
            );
        }

        await deleteFromCloudinary(
            user.avatar.publicId
        );

        user.avatar = {
            url: null,
            publicId: null,
        };

        await user.save();

        return successResponse(
            res,
            200,
            "Profile image removed successfully",
            getSafeUserResponse(user)
        );

    } catch (error) {
        next(error);
    }
};


// =====================================================
// DELETE USER
// =====================================================
//
// SUPER ADMIN:
// → DELETE ADMIN ONLY
//
// ADMIN:
// → DELETE OWN MANAGER ONLY
//
// MANAGER:
// → NOT ALLOWED
// =====================================================

export const deleteUser = async (
    req,
    res,
    next
) => {
    try {
        const { id } = req.params;

        const creatorSlug =
            await getAuthenticatedRoleSlug(
                req.user
            );

        const user =
            await User.findById(id);

        if (!user) {
            return errorResponse(
                res,
                404,
                "User not found"
            );
        }

        // =================================================
        // SUPER ADMIN → ADMIN ONLY
        // =================================================

        if (
            creatorSlug === "super-admin"
        ) {
            const adminRole =
                await getRoleBySlug("admin");

            if (!adminRole) {
                return errorResponse(
                    res,
                    500,
                    "Admin role is not configured"
                );
            }

            const isAdmin =
                user.role?.toString() ===
                adminRole._id.toString();

            if (!isAdmin) {
                return errorResponse(
                    res,
                    403,
                    "Super Admin can only delete Admin users from this endpoint"
                );
            }
        }

        // =================================================
        // ADMIN → OWN MANAGER ONLY
        // =================================================

        else if (
            creatorSlug === "admin"
        ) {
            const managerRole =
                await getRoleBySlug("manager");

            if (!managerRole) {
                return errorResponse(
                    res,
                    500,
                    "Manager role is not configured"
                );
            }

            const isOwnManager =
                user.role?.toString() ===
                    managerRole._id.toString() &&
                user.createdBy?.toString() ===
                    req.user._id.toString();

            if (!isOwnManager) {
                return errorResponse(
                    res,
                    403,
                    "You are not allowed to delete this user"
                );
            }
        }

        // =================================================
        // MANAGER
        // =================================================

        else {
            return errorResponse(
                res,
                403,
                "You are not allowed to delete users"
            );
        }

        // -------------------------------------------------
        // DELETE AVATAR
        // -------------------------------------------------

        await deleteUserAvatar(user);

        // -------------------------------------------------
        // DELETE USER
        // -------------------------------------------------

        await User.findByIdAndDelete(id);

        return successResponse(
            res,
            200,
            "User deleted successfully"
        );

    } catch (error) {
        next(error);
    }
};


// =====================================================
// LOGIN
// =====================================================

export const login = async (
    req,
    res,
    next
) => {
    try {
        const {
            email,
            password,
        } = req.body;

        const normalizedEmail =
            normalizeEmail(email);

        const user =
            await User.findOne({
                email: normalizedEmail,
            })
                .select("+password")
                .populate([
                    {
                        path: "role",
                        select:
                            "name slug permissions isActive",
                        populate: {
                            path: "permissions",
                            select:
                                "name resource action isActive",
                        },
                    },
                    {
                        path: "business",
                        select: "name",
                    },
                    {
                        path: "businessType",
                        select:
                            "name business",
                    },
                    {
                        path: "createdBy",
                        select:
                            "name email business businessType",
                        populate: [
                            {
                                path: "business",
                                select:
                                    "name",
                            },
                            {
                                path: "businessType",
                                select:
                                    "name",
                            },
                        ],
                    },
                ]);

        if (!user) {
            return errorResponse(
                res,
                401,
                "Invalid email or password"
            );
        }

        // =================================================
        // ACCOUNT STATUS
        // =================================================

        if (user.status !== "active") {
            const statusMessages = {
                pending:
                    "Your account is pending approval",
                rejected:
                    "Your account has been rejected",
                suspended:
                    "Your account has been blocked",
            };

            return errorResponse(
                res,
                403,
                statusMessages[user.status] ||
                    "Your account is not active"
            );
        }

        // =================================================
        // ROLE STATUS
        // =================================================

        if (
            !user.role ||
            !user.role.isActive
        ) {
            return errorResponse(
                res,
                403,
                "Your assigned role is inactive"
            );
        }

        // =================================================
        // PASSWORD
        // =================================================

        const isPasswordCorrect =
            await bcrypt.compare(
                password,
                user.password
            );

        if (!isPasswordCorrect) {
            return errorResponse(
                res,
                401,
                "Invalid email or password"
            );
        }

        // =================================================
        // LAST LOGIN
        // =================================================

        user.lastLoginAt =
            new Date();

        await user.save();

        // =================================================
        // TOKEN
        // =================================================

        const token =
            generateToken(user._id);

        setAuthCookie(
            res,
            token
        );

        return successResponse(
            res,
            200,
            "Login successful",
            {
                user:
                    getSafeUserResponse(
                        user
                    ),

                token,
            }
        );

    } catch (error) {
        next(error);
    }
};


// =====================================================
// LOGOUT
// =====================================================

export const logout = async (
    req,
    res,
    next
) => {
    try {
        res.clearCookie(
            "token",
            {
                httpOnly: true,

                secure:
                    process.env.NODE_ENV ===
                    "production",

                sameSite:
                    process.env.NODE_ENV ===
                    "production"
                        ? "none"
                        : "lax",
            }
        );

        return successResponse(
            res,
            200,
            "Logout successful"
        );

    } catch (error) {
        next(error);
    }
};


// =====================================================
// FORGOT PASSWORD
// =====================================================

export const forgotPassword = async (
    req,
    res,
    next
) => {
    try {
        const { email } =
            req.body;

        const normalizedEmail =
            normalizeEmail(email);

        const user =
            await User.findOne({
                email: normalizedEmail,
            });

        // Don't reveal whether email exists
        if (!user) {
            return successResponse(
                res,
                200,
                "If this email exists, a reset OTP has been sent."
            );
        }

        // -------------------------------------------------
        // GENERATE OTP
        // -------------------------------------------------

        const otp =
            crypto.randomInt(
                100000,
                1000000
            ).toString();

        // -------------------------------------------------
        // HASH OTP
        // -------------------------------------------------

        const hashedOtp =
            await bcrypt.hash(
                otp,
                10
            );

        // -------------------------------------------------
        // EXPIRY
        // -------------------------------------------------

        const otpExpiresAt =
            new Date(
                Date.now() +
                    10 * 60 * 1000
            );

        user.resetOtp =
            hashedOtp;

        user.resetOtpExpiresAt =
            otpExpiresAt;

        user.resetOtpAttempts =
            0;

        user.resetToken =
            undefined;

        user.resetTokenExpiresAt =
            undefined;

        await user.save();

        // -------------------------------------------------
        // SEND EMAIL
        // -------------------------------------------------

        await sendEmail({
            to: user.email,

            subject:
                "POS SaaS - Password Reset OTP",

            html: `
                <div
                    style="
                        font-family: Arial, sans-serif;
                        max-width: 600px;
                        margin: auto;
                    "
                >
                    <h2>Password Reset Request</h2>

                    <p>
                        Hello ${user.name},
                    </p>

                    <p>
                        We received a request to reset
                        your POS SaaS password.
                    </p>

                    <p>
                        Your password reset OTP is:
                    </p>

                    <h1
                        style="
                            letter-spacing: 8px;
                        "
                    >
                        ${otp}
                    </h1>

                    <p>
                        This OTP will expire in
                        <strong>10 minutes</strong>.
                    </p>

                    <p>
                        If you did not request a
                        password reset, you can
                        safely ignore this email.
                    </p>

                    <br />

                    <p>
                        POS SaaS Team
                    </p>
                </div>
            `,
        });

        return successResponse(
            res,
            200,
            "If this email exists, a reset OTP has been sent."
        );

    } catch (error) {
        next(error);
    }
};


// =====================================================
// VERIFY OTP
// =====================================================

export const verifyOtp = async (
    req,
    res,
    next
) => {
    try {
        const {
            email,
            otp,
        } = req.body;

        const normalizedEmail =
            normalizeEmail(email);

        const user =
            await User.findOne({
                email: normalizedEmail,
            }).select(
                "+resetOtp +resetOtpExpiresAt +resetOtpAttempts"
            );

        if (!user) {
            return errorResponse(
                res,
                400,
                "Invalid or expired OTP"
            );
        }

        if (
            !user.resetOtp ||
            !user.resetOtpExpiresAt
        ) {
            return errorResponse(
                res,
                400,
                "No password reset request found"
            );
        }

        // =================================================
        // EXPIRY
        // =================================================

        if (
            user.resetOtpExpiresAt.getTime() <
            Date.now()
        ) {
            user.resetOtp =
                undefined;

            user.resetOtpExpiresAt =
                undefined;

            user.resetOtpAttempts =
                0;

            await user.save();

            return errorResponse(
                res,
                400,
                "OTP has expired"
            );
        }

        // =================================================
        // MAX ATTEMPTS
        // =================================================

        if (
            user.resetOtpAttempts >= 5
        ) {
            user.resetOtp =
                undefined;

            user.resetOtpExpiresAt =
                undefined;

            user.resetOtpAttempts =
                0;

            await user.save();

            return errorResponse(
                res,
                429,
                "Too many invalid OTP attempts. Please request a new OTP."
            );
        }

        // =================================================
        // COMPARE OTP
        // =================================================

        const isOtpValid =
            await bcrypt.compare(
                otp,
                user.resetOtp
            );

        if (!isOtpValid) {
            user.resetOtpAttempts +=
                1;

            await user.save();

            const remainingAttempts =
                5 -
                user.resetOtpAttempts;

            return errorResponse(
                res,
                400,
                `Invalid OTP. ${remainingAttempts} attempt(s) remaining.`
            );
        }

        // =================================================
        // CREATE RESET TOKEN
        // =================================================

        const resetToken =
            crypto
                .randomBytes(32)
                .toString("hex");

        const hashedResetToken =
            crypto
                .createHash("sha256")
                .update(resetToken)
                .digest("hex");

        const resetTokenExpiresAt =
            new Date(
                Date.now() +
                    10 * 60 * 1000
            );

        user.resetToken =
            hashedResetToken;

        user.resetTokenExpiresAt =
            resetTokenExpiresAt;

        user.resetOtp =
            undefined;

        user.resetOtpExpiresAt =
            undefined;

        user.resetOtpAttempts =
            0;

        await user.save();

        return successResponse(
            res,
            200,
            "OTP verified successfully",
            {
                resetToken,
                expiresIn:
                    "10 minutes",
            }
        );

    } catch (error) {
        next(error);
    }
};


// =====================================================
// RESET PASSWORD
// =====================================================

export const resetPassword = async (
    req,
    res,
    next
) => {
    try {
        const {
            resetToken,
            password,
        } = req.body;

        if (!resetToken) {
            return errorResponse(
                res,
                400,
                "Reset token is required"
            );
        }

        // -------------------------------------------------
        // HASH TOKEN
        // -------------------------------------------------

        const hashedResetToken =
            crypto
                .createHash("sha256")
                .update(resetToken)
                .digest("hex");

        // -------------------------------------------------
        // FIND USER
        // -------------------------------------------------

        const user =
            await User.findOne({
                resetToken:
                    hashedResetToken,

                resetTokenExpiresAt: {
                    $gt: new Date(),
                },
            }).select(
                "+resetToken +resetTokenExpiresAt"
            );

        if (!user) {
            return errorResponse(
                res,
                400,
                "Invalid or expired reset token"
            );
        }

        // -------------------------------------------------
        // PASSWORD
        // -------------------------------------------------

        user.password =
            await bcrypt.hash(
                password,
                12
            );

        // -------------------------------------------------
        // CLEAR RESET DATA
        // -------------------------------------------------

        user.resetToken =
            undefined;

        user.resetTokenExpiresAt =
            undefined;

        user.resetOtp =
            undefined;

        user.resetOtpExpiresAt =
            undefined;

        user.resetOtpAttempts =
            0;

        await user.save();

        return successResponse(
            res,
            200,
            "Password reset successfully. Please login with your new password."
        );

    } catch (error) {
        next(error);
    }
};
