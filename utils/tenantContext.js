import mongoose from "mongoose";

import User from "../models/User.js";
import Role from "../models/Role.js";


// =====================================================
// GET ROLE SLUG
// =====================================================

const getRoleSlug = async (user) => {
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
        const role = await Role.findById(
            user.role
        ).select("slug");

        return role?.slug?.toLowerCase() || null;
    }

    return null;
};


// =====================================================
// GET TENANT CONTEXT
// =====================================================
//
// SUPER ADMIN
// → No tenant restriction
//
// ADMIN
// → tenantOwner = Admin._id
//
// MANAGER
// → tenantOwner = Manager.createdBy
//             = Admin._id
//
// =====================================================

export const getTenantContext = async (req) => {
    // -------------------------------------------------
    // AUTHENTICATED USER CHECK
    // -------------------------------------------------

    if (!req.user?._id) {
        throw new Error(
            "Authenticated user is required"
        );
    }

    // -------------------------------------------------
    // GET CURRENT USER
    // -------------------------------------------------
    //
    // We load the user from DB instead of relying
    // completely on req.user because protect middleware
    // may only contain the basic authenticated user.
    //
    // -------------------------------------------------

    const currentUser =
        await User.findById(req.user._id)
            .select(
                "_id role business businessType createdBy status"
            )
            .populate({
                path: "role",
                select: "slug isActive",
            });

    if (!currentUser) {
        throw new Error(
            "Authenticated user not found"
        );
    }

    // -------------------------------------------------
    // ROLE
    // -------------------------------------------------

    const roleSlug =
        await getRoleSlug(currentUser);

    if (!roleSlug) {
        throw new Error(
            "Unable to determine user role"
        );
    }

    // =================================================
    // SUPER ADMIN
    // =================================================

    if (roleSlug === "super-admin") {
        return {
            role: "super-admin",

            // Super Admin is not a tenant
            tenantOwner: null,

            business: null,
            businessType: null,

            isSuperAdmin: true,
            isTenantUser: false,
        };
    }

    // =================================================
    // ADMIN
    // =================================================

    if (roleSlug === "admin") {
        return {
            role: "admin",

            // Admin owns his complete tenant
            tenantOwner: currentUser._id,

            business:
                currentUser.business || null,

            businessType:
                currentUser.businessType || null,

            isSuperAdmin: false,
            isTenantUser: true,
        };
    }

    // =================================================
    // MANAGER
    // =================================================

    if (roleSlug === "manager") {
        // Manager must belong to an Admin
        if (!currentUser.createdBy) {
            throw new Error(
                "Manager is not assigned to an Admin"
            );
        }

        // -------------------------------------------------
        // GET MANAGER'S ADMIN
        // -------------------------------------------------

        const admin =
            await User.findById(
                currentUser.createdBy
            )
                .select(
                    "_id role business businessType status"
                )
                .populate({
                    path: "role",
                    select: "slug isActive",
                });

        if (!admin) {
            throw new Error(
                "Manager's Admin account was not found"
            );
        }

        // -------------------------------------------------
        // VERIFY CREATED BY USER IS ADMIN
        // -------------------------------------------------

        const adminRoleSlug =
            await getRoleSlug(admin);

        if (adminRoleSlug !== "admin") {
            throw new Error(
                "Manager is not assigned to a valid Admin"
            );
        }

        // -------------------------------------------------
        // ADMIN STATUS
        // -------------------------------------------------

        if (admin.status !== "active") {
            throw new Error(
                "Manager's Admin account is not active"
            );
        }

        // -------------------------------------------------
        // RETURN ADMIN TENANT
        // -------------------------------------------------

        return {
            role: "manager",

            // IMPORTANT:
            // Manager uses Admin's ID as tenantOwner
            tenantOwner: admin._id,

            // Manager inherits business context
            // from Admin
            business:
                admin.business || null,

            businessType:
                admin.businessType || null,

            isSuperAdmin: false,
            isTenantUser: true,
        };
    }

    // =================================================
    // UNKNOWN ROLE
    // =================================================

    throw new Error(
        `Unsupported user role: ${roleSlug}`
    );
};


// =====================================================
// BUILD TENANT QUERY
// =====================================================
//
// Use this in tenant-owned controllers.
//
// Example:
//
// const tenant = await getTenantContext(req);
//
// const customers = await Customer.find({
//     ...buildTenantQuery(tenant),
// });
//
// =====================================================

export const buildTenantQuery = (
    tenantContext
) => {
    // -------------------------------------------------
    // SUPER ADMIN
    // -------------------------------------------------
    //
    // Super Admin can see global/all tenant data
    // when the controller allows it.
    //
    // -------------------------------------------------

    if (tenantContext.isSuperAdmin) {
        return {};
    }

    // -------------------------------------------------
    // ADMIN / MANAGER
    // -------------------------------------------------

    if (!tenantContext.tenantOwner) {
        throw new Error(
            "Tenant owner is required"
        );
    }

    return {
        tenantOwner:
            tenantContext.tenantOwner,
    };
};


// =====================================================
// BUILD TENANT + BUSINESS QUERY
// =====================================================
//
// Use this only when you specifically need
// tenantOwner + business + businessType.
//
// Normal tenant isolation should primarily use
// tenantOwner.
//
// =====================================================

export const buildTenantBusinessQuery = (
    tenantContext
) => {
    const query =
        buildTenantQuery(tenantContext);

    // Super Admin has no fixed business context
    if (tenantContext.isSuperAdmin) {
        return query;
    }

    if (tenantContext.business) {
        query.business =
            tenantContext.business;
    }

    if (tenantContext.businessType) {
        query.businessType =
            tenantContext.businessType;
    }

    return query;
};


// =====================================================
// OBJECT ID VALIDATION
// =====================================================

export const isValidObjectId = (id) => {
    return mongoose.Types.ObjectId.isValid(id);
};


// =====================================================
// GET TENANT OWNER ID
// =====================================================
//
// Small helper when you only need the owner ID.
//
// =====================================================

export const getTenantOwner = async (req) => {
    const tenant =
        await getTenantContext(req);

    return tenant.tenantOwner;
};