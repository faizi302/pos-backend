import bcrypt from "bcryptjs";
import crypto from "crypto";

import User from "../models/User.js";
import Role from "../models/Role.js";
import Business from "../models/Business.js";
import BusinessType from "../models/BusinessType.js";

import { successResponse, errorResponse } from "../utils/apiResponse.js";
import { generateToken, setAuthCookie } from "../utils/generateToken.js";
import {
    uploadToCloudinary,
    deleteFromCloudinary,
} from "../utils/cloudinaryUpload.js";
import sendEmail from "../utils/sendEmail.js";

// =====================================================
// CONSTANTS
// =====================================================

const USER_STATUSES = ["active", "pending", "rejected", "suspended"];

// =====================================================
// HELPERS
// =====================================================

const toTitleCase = (value) => {
    if (!value || typeof value !== "string") return value;
    return value
        .trim()
        .toLowerCase()
        .split(/\s+/)
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(" ");
};

const normalizeEmail = (email) => email?.trim().toLowerCase();

const isValidStatus = (status) => USER_STATUSES.includes(status);

const getAuthenticatedRoleSlug = async (user) => {
    if (!user?.role) return null;

    if (typeof user.role === "object" && user.role.slug) {
        return user.role.slug.toLowerCase();
    }

    const role = await Role.findById(user.role).select("slug");
    return role?.slug?.toLowerCase() || null;
};

const getRoleBySlug = async (slug) => {
    return Role.findOne({ slug: slug.toLowerCase(), isActive: true });
};

const emailExists = async (email, excludedUserId = null) => {
    const filter = { email: normalizeEmail(email) };
    if (excludedUserId) filter._id = { $ne: excludedUserId };
    return User.findOne(filter);
};

const validateBusiness = async (businessId) => {
    if (!businessId) return null;

    const business = await Business.findById(businessId);
    if (!business) return { error: "Selected business not found" };
    if (!business.isActive) return { error: "Selected business is inactive" };

    return { business };
};

const validateBusinessType = async (businessTypeId, businessId) => {
    if (!businessTypeId) return null;
    if (!businessId) {
        return { error: "Business is required when Business Type is provided" };
    }

    const businessType = await BusinessType.findOne({
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
        return { error: "Selected business type is inactive" };
    }

    return { businessType };
};

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
        { path: "business", select: "name" },
        { path: "businessType", select: "name business" },
        {
            path: "createdBy",
            select: "name email business businessType logo",
            populate: [
                { path: "business", select: "name" },
                { path: "businessType", select: "name" },
            ],
        },
    ]);
    return user;
};

const getSafeUserResponse = (user) => {
    const data = user.toObject();
    delete data.password;
    delete data.resetOtp;
    delete data.resetOtpExpiresAt;
    delete data.resetOtpAttempts;
    delete data.resetToken;
    delete data.resetTokenExpiresAt;
    return data;
};

const uploadImage = async (file, folder = "pos/users") => {
    if (!file) return null;
    const result = await uploadToCloudinary(file.buffer, folder);
    return {
        url: result.secure_url,
        publicId: result.public_id,
    };
};

const deleteImage = async (publicId) => {
    if (!publicId) return;
    try {
        await deleteFromCloudinary(publicId);
    } catch (err) {
        console.error("Cloudinary delete failed:", err);
    }
};

const getFile = (req, field) => {
    // Supports both upload.single() and upload.fields()
    if (req.file && req.file.fieldname === field) return req.file;
    if (req.files?.[field]?.[0]) return req.files[field][0];
    return null;
};

const applyTitleCaseFields = (data) => {
    if (data.name !== undefined) data.name = toTitleCase(data.name);
    if (data.country !== undefined) data.country = toTitleCase(data.country);
    if (data.city !== undefined) data.city = toTitleCase(data.city);
    if (data.address !== undefined) data.address = toTitleCase(data.address);
    return data;
};

// =====================================================
// PUBLIC SIGNUP (creates Admin → status: pending)
// =====================================================

export const signup = async (req, res, next) => {
    try {
        let {
            name,
            email,
            phone,
            password,
            country,
            city,
            address,
            business,
            businessType,
        } = req.body;

        ({ name, country, city, address } = applyTitleCaseFields({
            name,
            country,
            city,
            address,
        }));

        const normalizedEmail = normalizeEmail(email);

        if (await emailExists(normalizedEmail)) {
            return errorResponse(res, 409, "User with this email already exists");
        }

        const adminRole = await getRoleBySlug("admin");
        if (!adminRole) {
            return errorResponse(res, 500, "Admin role is not configured");
        }

        let validatedBusiness = null;
        if (business) {
            const result = await validateBusiness(business);
            if (result?.error) return errorResponse(res, 400, result.error);
            validatedBusiness = result.business._id;
        }

        let validatedBusinessType = null;
        if (businessType) {
            const result = await validateBusinessType(
                businessType,
                validatedBusiness
            );
            if (result?.error) return errorResponse(res, 400, result.error);
            validatedBusinessType = result.businessType._id;
        }

        const hashedPassword = await bcrypt.hash(password, 12);
        const avatar = await uploadImage(getFile(req, "avatar"));
        const logo = await uploadImage(getFile(req, "logo"), "pos/logos");

        const user = await User.create({
            name,
            email: normalizedEmail,
            phone,
            password: hashedPassword,
            country,
            city,
            address,
            role: adminRole._id,
            business: validatedBusiness,
            businessType: validatedBusinessType,
            createdBy: null,
            status: "pending",
            isEmailVerified: false,
            avatar,
            logo,
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

export const createUser = async (req, res, next) => {
    try {
        let {
            name,
            email,
            phone,
            password,
            country,
            city,
            address,
            role,
            business,
            businessType,
            status,
            isEmailVerified,
        } = req.body;

        ({ name, country, city, address } = applyTitleCaseFields({
            name,
            country,
            city,
            address,
        }));

        const creatorSlug = await getAuthenticatedRoleSlug(req.user);
        if (!creatorSlug) {
            return errorResponse(res, 403, "Unable to determine your role");
        }

        const normalizedEmail = normalizeEmail(email);
        if (await emailExists(normalizedEmail)) {
            return errorResponse(res, 409, "User with this email already exists");
        }

        // ---------- ADMIN → creates MANAGER ----------
        if (creatorSlug === "admin") {
            const managerRole = await getRoleBySlug("manager");
            if (!managerRole) {
                return errorResponse(res, 500, "Manager role is not configured");
            }

            if (role && role !== managerRole._id.toString()) {
                return errorResponse(res, 403, "Admin can only create Manager users");
            }

            if (business !== undefined || businessType !== undefined) {
                return errorResponse(
                    res,
                    403,
                    "Business information is managed by the Admin account"
                );
            }

            if (status !== undefined && !isValidStatus(status)) {
                return errorResponse(res, 400, "Invalid user status");
            }

            const hashedPassword = await bcrypt.hash(password, 12);
            const avatar = await uploadImage(getFile(req, "avatar"));

            const manager = await User.create({
                name,
                email: normalizedEmail,
                phone,
                password: hashedPassword,
                country,
                city,
                address,
                role: managerRole._id,
                business: null,
                businessType: null,
                createdBy: req.user._id,
                status: status || "active",
                isEmailVerified: isEmailVerified ?? false,
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

        // ---------- SUPER ADMIN → creates ADMIN ----------
        if (creatorSlug === "super-admin") {
            const adminRole = await getRoleBySlug("admin");
            if (!adminRole) {
                return errorResponse(res, 500, "Admin role is not configured");
            }

            if (role && role !== adminRole._id.toString()) {
                return errorResponse(
                    res,
                    403,
                    "Super Admin can create Admin users through this endpoint"
                );
            }

            if (status !== undefined && !isValidStatus(status)) {
                return errorResponse(res, 400, "Invalid user status");
            }

            let validatedBusiness = null;
            if (business) {
                const result = await validateBusiness(business);
                if (result?.error) return errorResponse(res, 400, result.error);
                validatedBusiness = result.business._id;
            }

            let validatedBusinessType = null;
            if (businessType) {
                const result = await validateBusinessType(
                    businessType,
                    validatedBusiness
                );
                if (result?.error) return errorResponse(res, 400, result.error);
                validatedBusinessType = result.businessType._id;
            }

            const hashedPassword = await bcrypt.hash(password, 12);
            const avatar = await uploadImage(getFile(req, "avatar"));
            const logo = await uploadImage(getFile(req, "logo"), "pos/logos");

            const user = await User.create({
                name,
                email: normalizedEmail,
                phone,
                password: hashedPassword,
                country,
                city,
                address,
                role: adminRole._id,
                business: validatedBusiness,
                businessType: validatedBusinessType,
                createdBy: null,
                status: status || "active",
                isEmailVerified: isEmailVerified ?? false,
                avatar,
                logo,
            });

            await populateUser(user);
            return successResponse(
                res,
                201,
                "Admin created successfully",
                getSafeUserResponse(user)
            );
        }

        return errorResponse(res, 403, "Managers are not allowed to create users");
    } catch (error) {
        next(error);
    }
};

// =====================================================
// CREATE MANAGER (Admin only)
// =====================================================

export const createManager = async (req, res, next) => {
    try {
        let { name, email, phone, password, country, city, address } = req.body;

        ({ name, country, city, address } = applyTitleCaseFields({
            name,
            country,
            city,
            address,
        }));

        const creatorSlug = await getAuthenticatedRoleSlug(req.user);
        if (creatorSlug !== "admin") {
            return errorResponse(res, 403, "Only Admin can create managers");
        }

        const normalizedEmail = normalizeEmail(email);
        if (await emailExists(normalizedEmail)) {
            return errorResponse(res, 409, "User with this email already exists");
        }

        const managerRole = await getRoleBySlug("manager");
        if (!managerRole) {
            return errorResponse(res, 500, "Manager role is not configured");
        }

        const hashedPassword = await bcrypt.hash(password, 12);
        const avatar = await uploadImage(getFile(req, "avatar"));

        const manager = await User.create({
            name,
            email: normalizedEmail,
            phone,
            password: hashedPassword,
            country,
            city,
            address,
            role: managerRole._id,
            business: null,
            businessType: null,
            createdBy: req.user._id,
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

export const getAllUsers = async (req, res, next) => {
    try {
        const creatorSlug = await getAuthenticatedRoleSlug(req.user);

        if (creatorSlug === "super-admin") {
            const adminRole = await getRoleBySlug("admin");
            if (!adminRole) {
                return errorResponse(res, 500, "Admin role is not configured");
            }

            const admins = await User.find({ role: adminRole._id })
                .select("-password")
                .populate([
                    {
                        path: "role",
                        select: "name slug permissions isActive",
                        populate: {
                            path: "permissions",
                            select: "name resource action isActive",
                        },
                    },
                    { path: "business", select: "name" },
                    { path: "businessType", select: "name business" },
                ])
                .sort({ createdAt: -1 });

            return successResponse(
                res,
                200,
                "Admins fetched successfully",
                admins.map(getSafeUserResponse)
            );
        }

        if (creatorSlug === "admin") {
            const managerRole = await getRoleBySlug("manager");
            if (!managerRole) {
                return errorResponse(res, 500, "Manager role is not configured");
            }

            const managers = await User.find({
                role: managerRole._id,
                createdBy: req.user._id,
            })
                .select("-password")
                .populate([
                    {
                        path: "role",
                        select: "name slug permissions isActive",
                        populate: {
                            path: "permissions",
                            select: "name resource action isActive",
                        },
                    },
                    {
                        path: "createdBy",
                        select: "name email business businessType logo",
                        populate: [
                            { path: "business", select: "name" },
                            { path: "businessType", select: "name" },
                        ],
                    },
                ])
                .sort({ createdAt: -1 });

            return successResponse(
                res,
                200,
                "Managers fetched successfully",
                managers.map(getSafeUserResponse)
            );
        }

        return errorResponse(res, 403, "You are not allowed to view users");
    } catch (error) {
        next(error);
    }
};

// =====================================================
// GET MY PROFILE
// =====================================================

export const getMyProfile = async (req, res, next) => {
    try {
        const user = await User.findById(req.user._id).select("-password");
        if (!user) return errorResponse(res, 404, "User not found");

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

export const getUserById = async (req, res, next) => {
    try {
        const { id } = req.params;
        const creatorSlug = await getAuthenticatedRoleSlug(req.user);

        if (creatorSlug === "super-admin") {
            const adminRole = await getRoleBySlug("admin");
            const managerRole = await getRoleBySlug("manager");

            if (!adminRole || !managerRole) {
                return errorResponse(res, 500, "Required roles are not configured");
            }

            const admin = await User.findOne({
                _id: id,
                role: adminRole._id,
            }).select("-password");

            if (!admin) return errorResponse(res, 404, "Admin not found");

            await populateUser(admin);

            const managers = await User.find({
                role: managerRole._id,
                createdBy: admin._id,
            })
                .select("-password")
                .populate([
                    {
                        path: "role",
                        select: "name slug permissions isActive",
                        populate: {
                            path: "permissions",
                            select: "name resource action isActive",
                        },
                    },
                    {
                        path: "createdBy",
                        select: "name email business businessType logo",
                        populate: [
                            { path: "business", select: "name" },
                            { path: "businessType", select: "name" },
                        ],
                    },
                ])
                .sort({ createdAt: -1 });

            const response = getSafeUserResponse(admin);
            response.managers = managers.map(getSafeUserResponse);
            response.managerCount = managers.length;

            return successResponse(
                res,
                200,
                "Admin details fetched successfully",
                response
            );
        }

        if (creatorSlug === "admin") {
            const managerRole = await getRoleBySlug("manager");
            if (!managerRole) {
                return errorResponse(res, 500, "Manager role is not configured");
            }

            const manager = await User.findOne({
                _id: id,
                role: managerRole._id,
                createdBy: req.user._id,
            }).select("-password");

            if (!manager) {
                return errorResponse(res, 404, "Manager not found");
            }

            await populateUser(manager);
            return successResponse(
                res,
                200,
                "Manager details fetched successfully",
                getSafeUserResponse(manager)
            );
        }

        return errorResponse(res, 403, "You are not allowed to view this user");
    } catch (error) {
        next(error);
    }
};

// =====================================================
// GET ALL MANAGERS
// =====================================================

export const getAllManagers = async (req, res, next) => {
    try {
        const creatorSlug = await getAuthenticatedRoleSlug(req.user);
        const managerRole = await getRoleBySlug("manager");

        if (!managerRole) {
            return errorResponse(res, 500, "Manager role is not configured");
        }

        let filter = { role: managerRole._id };

        if (creatorSlug === "admin") {
            filter.createdBy = req.user._id;
        } else if (creatorSlug !== "super-admin") {
            return errorResponse(res, 403, "You are not allowed to view managers");
        }

        const managers = await User.find(filter)
            .select("-password")
            .populate([
                {
                    path: "role",
                    select: "name slug permissions isActive",
                    populate: {
                        path: "permissions",
                        select: "name resource action isActive",
                    },
                },
                {
                    path: "createdBy",
                    select: "name email business businessType logo",
                    populate: [
                        { path: "business", select: "name" },
                        { path: "businessType", select: "name" },
                    ],
                },
            ])
            .sort({ createdAt: -1 });

        return successResponse(
            res,
            200,
            "Managers fetched successfully",
            managers.map(getSafeUserResponse)
        );
    } catch (error) {
        next(error);
    }
};

// =====================================================
// GET MANAGER BY ID
// =====================================================

export const getManagerById = async (req, res, next) => {
    try {
        const { id } = req.params;
        const creatorSlug = await getAuthenticatedRoleSlug(req.user);
        const managerRole = await getRoleBySlug("manager");

        if (!managerRole) {
            return errorResponse(res, 500, "Manager role is not configured");
        }

        const filter = {
            _id: id,
            role: managerRole._id,
        };

        if (creatorSlug === "admin") {
            filter.createdBy = req.user._id;
        } else if (creatorSlug !== "super-admin") {
            return errorResponse(res, 403, "You are not allowed to view this manager");
        }

        const manager = await User.findOne(filter).select("-password");
        if (!manager) return errorResponse(res, 404, "Manager not found");

        await populateUser(manager);
        return successResponse(
            res,
            200,
            "Manager details fetched successfully",
            getSafeUserResponse(manager)
        );
    } catch (error) {
        next(error);
    }
};

// =====================================================
// UPDATE USER
// =====================================================

export const updateUser = async (req, res, next) => {
    try {
        const { id } = req.params;
        let {
            name,
            email,
            phone,
            password,
            country,
            city,
            address,
            role,
            business,
            businessType,
            status,
            isEmailVerified,
        } = req.body;

        ({ name, country, city, address } = applyTitleCaseFields({
            name,
            country,
            city,
            address,
        }));

        const creatorSlug = await getAuthenticatedRoleSlug(req.user);
        const user = await User.findById(id).select("+password");
        if (!user) return errorResponse(res, 404, "User not found");

        // ---------- ADMIN → own Manager only ----------
        if (creatorSlug === "admin") {
            const managerRole = await getRoleBySlug("manager");
            if (!managerRole) {
                return errorResponse(res, 500, "Manager role is not configured");
            }

            const isOwnManager =
                user.role?.toString() === managerRole._id.toString() &&
                user.createdBy?.toString() === req.user._id.toString();

            if (!isOwnManager) {
                return errorResponse(res, 403, "You are not allowed to update this user");
            }

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

        // ---------- SUPER ADMIN → Admin only ----------
        else if (creatorSlug === "super-admin") {
            const adminRole = await getRoleBySlug("admin");
            if (!adminRole) {
                return errorResponse(res, 500, "Admin role is not configured");
            }

            if (user.role?.toString() !== adminRole._id.toString()) {
                return errorResponse(
                    res,
                    403,
                    "Super Admin can only update Admin users from this endpoint"
                );
            }

            if (
                role !== undefined &&
                role !== null &&
                role.toString() !== user.role.toString()
            ) {
                return errorResponse(
                    res,
                    403,
                    "Admin role cannot be changed from this endpoint"
                );
            }
        } else {
            return errorResponse(res, 403, "You are not allowed to update users");
        }

        // Status
        if (status !== undefined) {
            if (!isValidStatus(status)) {
                return errorResponse(res, 400, "Invalid user status");
            }
            user.status = status;
        }

        // Email
        if (email !== undefined) {
            const normalizedEmail = normalizeEmail(email);
            if (normalizedEmail !== user.email) {
                if (await emailExists(normalizedEmail, id)) {
                    return errorResponse(
                        res,
                        409,
                        "Another user already uses this email"
                    );
                }
                user.email = normalizedEmail;
                user.isEmailVerified = false;
            }
        }

        // Basic fields
        if (name !== undefined) user.name = name;
        if (phone !== undefined) user.phone = phone;
        if (country !== undefined) user.country = country;
        if (city !== undefined) user.city = city;
        if (address !== undefined) user.address = address;
        if (isEmailVerified !== undefined) user.isEmailVerified = isEmailVerified;

        // Super Admin → business / businessType
        if (creatorSlug === "super-admin") {
            if (business !== undefined) {
                if (business === null || business === "") {
                    user.business = null;
                    user.businessType = null;
                } else {
                    const result = await validateBusiness(business);
                    if (result?.error) return errorResponse(res, 400, result.error);

                    const newBusinessId = result.business._id;
                    const businessChanged =
                        user.business?.toString() !== newBusinessId.toString();

                    user.business = newBusinessId;
                    if (businessChanged && businessType === undefined) {
                        user.businessType = null;
                    }
                }
            }

            if (businessType !== undefined) {
                if (businessType === null || businessType === "") {
                    user.businessType = null;
                } else {
                    if (!user.business) {
                        return errorResponse(
                            res,
                            400,
                            "Business is required when Business Type is provided"
                        );
                    }
                    const result = await validateBusinessType(
                        businessType,
                        user.business
                    );
                    if (result?.error) return errorResponse(res, 400, result.error);
                    user.businessType = result.businessType._id;
                }
            }
        }

        // Password
        if (password !== undefined && password.trim()) {
            user.password = await bcrypt.hash(password, 12);
        }

        // Avatar
        const avatarFile = getFile(req, "avatar");
        if (avatarFile) {
            const oldPublicId = user.avatar?.publicId;
            user.avatar = await uploadImage(avatarFile);
            await deleteImage(oldPublicId);
        }

        // Logo (mainly for Admin)
        const logoFile = getFile(req, "logo");
        if (logoFile) {
            const oldPublicId = user.logo?.publicId;
            user.logo = await uploadImage(logoFile, "pos/logos");
            await deleteImage(oldPublicId);
        }

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

// =====================================================
// UPDATE MY PROFILE
// =====================================================
//
// Every authenticated user can update:
// - name, phone, country, city, address
// - avatar, logo
// - password (requires currentPassword + new password)
//
// Role / business / status / email cannot be changed here.
// =====================================================

export const updateMyProfile = async (req, res, next) => {
    try {
        // Load user with password (needed for password change)
        const user = await User.findById(req.user._id).select("+password");
        if (!user) {
            return errorResponse(res, 404, "User not found");
        }

        let {
            name,
            phone,
            country,
            city,
            address,
            currentPassword,
            password,
            confirmPassword,
        } = req.body;

        // Title case for name & address fields
        ({ name, country, city, address } = applyTitleCaseFields({
            name,
            country,
            city,
            address,
        }));

        // -------------------------------------------------
        // BASIC PROFILE FIELDS
        // -------------------------------------------------

        if (name !== undefined) user.name = name;
        if (phone !== undefined) user.phone = phone;
        if (country !== undefined) user.country = country;
        if (city !== undefined) user.city = city;
        if (address !== undefined) user.address = address;

        // -------------------------------------------------
        // PASSWORD CHANGE (optional)
        // -------------------------------------------------

        if (password !== undefined && password.trim()) {
            // 1. Current password is required
            if (!currentPassword) {
                return errorResponse(res, 400, "Current password is required");
            }

            // 2. Verify current password
            const isMatch = await bcrypt.compare(currentPassword, user.password);
            if (!isMatch) {
                return errorResponse(res, 400, "Current password is incorrect");
            }

            // 3. Validate new password length
            if (password.trim().length < 6) {
                return errorResponse(
                    res,
                    400,
                    "New password must be at least 6 characters"
                );
            }

            // 4. Confirm password match (if provided)
            if (confirmPassword !== undefined && password !== confirmPassword) {
                return errorResponse(res, 400, "Passwords do not match");
            }

            // 5. Hash and save new password
            user.password = await bcrypt.hash(password.trim(), 12);
        }

        // -------------------------------------------------
        // AVATAR
        // -------------------------------------------------

        const avatarFile = getFile(req, "avatar");
        if (avatarFile) {
            const oldPublicId = user.avatar?.publicId;
            user.avatar = await uploadImage(avatarFile);
            await deleteImage(oldPublicId);
        }

        // -------------------------------------------------
        // LOGO (mainly for Admin)
        // -------------------------------------------------

        const logoFile = getFile(req, "logo");
        if (logoFile) {
            const oldPublicId = user.logo?.publicId;
            user.logo = await uploadImage(logoFile, "pos/logos");
            await deleteImage(oldPublicId);
        }

        // -------------------------------------------------
        // SAVE
        // -------------------------------------------------

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

export const removeMyAvatar = async (req, res, next) => {
    try {
        const user = await User.findById(req.user._id);
        if (!user) return errorResponse(res, 404, "User not found");

        if (!user.avatar?.publicId) {
            return successResponse(res, 200, "No profile image to remove");
        }

        await deleteImage(user.avatar.publicId);
        user.avatar = { url: null, publicId: null };
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

export const deleteUser = async (req, res, next) => {
    try {
        const { id } = req.params;
        const creatorSlug = await getAuthenticatedRoleSlug(req.user);
        const user = await User.findById(id);

        if (!user) return errorResponse(res, 404, "User not found");

        if (creatorSlug === "super-admin") {
            const adminRole = await getRoleBySlug("admin");
            if (!adminRole) {
                return errorResponse(res, 500, "Admin role is not configured");
            }
            if (user.role?.toString() !== adminRole._id.toString()) {
                return errorResponse(
                    res,
                    403,
                    "Super Admin can only delete Admin users from this endpoint"
                );
            }
        } else if (creatorSlug === "admin") {
            const managerRole = await getRoleBySlug("manager");
            if (!managerRole) {
                return errorResponse(res, 500, "Manager role is not configured");
            }

            const isOwnManager =
                user.role?.toString() === managerRole._id.toString() &&
                user.createdBy?.toString() === req.user._id.toString();

            if (!isOwnManager) {
                return errorResponse(
                    res,
                    403,
                    "You are not allowed to delete this user"
                );
            }
        } else {
            return errorResponse(res, 403, "You are not allowed to delete users");
        }

        await deleteImage(user.avatar?.publicId);
        await deleteImage(user.logo?.publicId);
        await User.findByIdAndDelete(id);

        return successResponse(res, 200, "User deleted successfully");
    } catch (error) {
        next(error);
    }
};

// =====================================================
// LOGIN
// =====================================================

export const login = async (req, res, next) => {
    try {
        const { email, password } = req.body;
        const normalizedEmail = normalizeEmail(email);

        const user = await User.findOne({ email: normalizedEmail })
            .select("+password")
            .populate([
                {
                    path: "role",
                    select: "name slug permissions isActive",
                    populate: {
                        path: "permissions",
                        select: "name resource action isActive",
                    },
                },
                { path: "business", select: "name" },
                { path: "businessType", select: "name business" },
                {
                    path: "createdBy",
                    select: "name email business businessType logo",
                    populate: [
                        { path: "business", select: "name" },
                        { path: "businessType", select: "name" },
                    ],
                },
            ]);

        if (!user) {
            return errorResponse(res, 401, "Invalid email or password");
        }

        if (user.status !== "active") {
            const messages = {
                pending: "Your account is pending approval",
                rejected: "Your account has been rejected",
                suspended: "Your account has been blocked",
            };
            return errorResponse(
                res,
                403,
                messages[user.status] || "Your account is not active"
            );
        }

        if (!user.role || !user.role.isActive) {
            return errorResponse(res, 403, "Your assigned role is inactive");
        }

        const isPasswordCorrect = await bcrypt.compare(password, user.password);
        if (!isPasswordCorrect) {
            return errorResponse(res, 401, "Invalid email or password");
        }

        user.lastLoginAt = new Date();
        await user.save();

        const token = generateToken(user._id);
        setAuthCookie(res, token);

        return successResponse(res, 200, "Login successful", {
            user: getSafeUserResponse(user),
            token,
        });
    } catch (error) {
        next(error);
    }
};

// =====================================================
// LOGOUT
// =====================================================

export const logout = async (req, res, next) => {
    try {
        res.clearCookie("token", {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
        });

        return successResponse(res, 200, "Logout successful");
    } catch (error) {
        next(error);
    }
};

// =====================================================
// FORGOT PASSWORD
// =====================================================

export const forgotPassword = async (req, res, next) => {
    try {
        const { email } = req.body;
        const user = await User.findOne({ email: normalizeEmail(email) });

        // Always return success (security)
        if (!user) {
            return successResponse(
                res,
                200,
                "If this email exists, a reset OTP has been sent."
            );
        }

        const otp = crypto.randomInt(100000, 1000000).toString();
        const hashedOtp = await bcrypt.hash(otp, 10);

        user.resetOtp = hashedOtp;
        user.resetOtpExpiresAt = new Date(Date.now() + 10 * 60 * 1000);
        user.resetOtpAttempts = 0;
        user.resetToken = undefined;
        user.resetTokenExpiresAt = undefined;
        await user.save();

        await sendEmail({
            to: user.email,
            subject: "POS SaaS - Password Reset OTP",
            html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto;">
          <h2>Password Reset Request</h2>
          <p>Hello ${user.name},</p>
          <p>Your password reset OTP is:</p>
          <h1 style="letter-spacing: 8px;">${otp}</h1>
          <p>This OTP will expire in <strong>10 minutes</strong>.</p>
          <p>If you did not request this, ignore this email.</p>
          <br/><p>POS SaaS Team</p>
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

export const verifyOtp = async (req, res, next) => {
    try {
        const { email, otp } = req.body;

        const user = await User.findOne({
            email: normalizeEmail(email),
        }).select("+resetOtp +resetOtpExpiresAt +resetOtpAttempts");

        if (!user || !user.resetOtp || !user.resetOtpExpiresAt) {
            return errorResponse(res, 400, "Invalid or expired OTP");
        }

        if (user.resetOtpExpiresAt.getTime() < Date.now()) {
            user.resetOtp = undefined;
            user.resetOtpExpiresAt = undefined;
            user.resetOtpAttempts = 0;
            await user.save();
            return errorResponse(res, 400, "OTP has expired");
        }

        if (user.resetOtpAttempts >= 5) {
            user.resetOtp = undefined;
            user.resetOtpExpiresAt = undefined;
            user.resetOtpAttempts = 0;
            await user.save();
            return errorResponse(
                res,
                429,
                "Too many invalid OTP attempts. Please request a new OTP."
            );
        }

        const isOtpValid = await bcrypt.compare(otp, user.resetOtp);
        if (!isOtpValid) {
            user.resetOtpAttempts += 1;
            await user.save();
            const remaining = 5 - user.resetOtpAttempts;
            return errorResponse(
                res,
                400,
                `Invalid OTP. ${remaining} attempt(s) remaining.`
            );
        }

        const resetToken = crypto.randomBytes(32).toString("hex");
        const hashedResetToken = crypto
            .createHash("sha256")
            .update(resetToken)
            .digest("hex");

        user.resetToken = hashedResetToken;
        user.resetTokenExpiresAt = new Date(Date.now() + 10 * 60 * 1000);
        user.resetOtp = undefined;
        user.resetOtpExpiresAt = undefined;
        user.resetOtpAttempts = 0;
        await user.save();

        return successResponse(res, 200, "OTP verified successfully", {
            resetToken,
            expiresIn: "10 minutes",
        });
    } catch (error) {
        next(error);
    }
};

// =====================================================
// RESET PASSWORD
// =====================================================

export const resetPassword = async (req, res, next) => {
    try {
        const { resetToken, password } = req.body;

        if (!resetToken) {
            return errorResponse(res, 400, "Reset token is required");
        }

        const hashedResetToken = crypto
            .createHash("sha256")
            .update(resetToken)
            .digest("hex");

        const user = await User.findOne({
            resetToken: hashedResetToken,
            resetTokenExpiresAt: { $gt: new Date() },
        }).select("+resetToken +resetTokenExpiresAt");

        if (!user) {
            return errorResponse(res, 400, "Invalid or expired reset token");
        }

        user.password = await bcrypt.hash(password, 12);
        user.resetToken = undefined;
        user.resetTokenExpiresAt = undefined;
        user.resetOtp = undefined;
        user.resetOtpExpiresAt = undefined;
        user.resetOtpAttempts = 0;
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