
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
        const role = await Role.findById(user.role)
            .select("slug");

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
        // VERIFY ADMIN ROLE
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

            // Manager uses Admin ID
            // as tenant owner
            tenantOwner: admin._id,

            // Manager inherits Admin business
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
// Main tenant isolation.
//
// Super Admin:
// → {}
//
// Admin:
// → { tenantOwner: Admin._id }
//
// Manager:
// → { tenantOwner: Admin._id }
//
// =====================================================

export const buildTenantQuery = (
    tenantContext
) => {
    // -------------------------------------------------
    // SUPER ADMIN
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
// Used for:
//
// Business
// BusinessType
// Brand
// Model
// Product
// ProductInventory
//
// For Admin / Manager:
//
// tenantOwner
// + business
// + businessType
//
// Super Admin:
//
// no tenant restriction
//
// =====================================================

export const buildTenantBusinessQuery = (
    tenantContext
) => {
    const query =
        buildTenantQuery(tenantContext);

    // Super Admin
    if (tenantContext.isSuperAdmin) {
        return query;
    }

    // -------------------------------------------------
    // BUSINESS
    // -------------------------------------------------

    if (tenantContext.business) {
        query.business =
            tenantContext.business;
    }

    // -------------------------------------------------
    // BUSINESS TYPE
    // -------------------------------------------------

    if (tenantContext.businessType) {
        query.businessType =
            tenantContext.businessType;
    }

    return query;
};


// =====================================================
// BUSINESS QUERY
// =====================================================
//
// Business documents:
//
// {
//     tenantOwner,
//     ...
// }
//
// =====================================================

export const buildBusinessQuery = (
    tenantContext
) => {
    return buildTenantQuery(
        tenantContext
    );
};


// =====================================================
// BUSINESS TYPE QUERY
// =====================================================
//
// BusinessType documents:
//
// {
//     tenantOwner,
//     business,
//     ...
// }
//
// =====================================================

export const buildBusinessTypeQuery = (
    tenantContext
) => {
    return buildTenantBusinessQuery(
        tenantContext
    );
};


// =====================================================
// BRAND QUERY
// =====================================================
//
// Brand documents:
//
// {
//     tenantOwner,
//     business,
//     businessType,
//     ...
// }
//
// =====================================================

export const buildBrandQuery = (
    tenantContext
) => {
    return buildTenantBusinessQuery(
        tenantContext
    );
};


// =====================================================
// MODEL QUERY
// =====================================================
//
// Model documents:
//
// {
//     tenantOwner,
//     business,
//     businessType,
//     brand,
//     ...
// }
//
// =====================================================

export const buildModelQuery = (
    tenantContext
) => {
    return buildTenantBusinessQuery(
        tenantContext
    );
};


// =====================================================
// PRODUCT QUERY
// =====================================================
//
// Product documents:
//
// {
//     tenantOwner,
//     business,
//     businessType,
//     category,
//     brand,
//     model,
//     ...
// }
//
// =====================================================

export const buildProductQuery = (
    tenantContext
) => {
    return buildTenantBusinessQuery(
        tenantContext
    );
};


// =====================================================
// PRODUCT INVENTORY QUERY
// =====================================================
//
// ProductInventory documents:
//
// {
//     tenantOwner,
//     business,
//     businessType,
//     product,
//     ...
// }
//
// =====================================================

export const buildProductInventoryQuery = (
    tenantContext
) => {
    return buildTenantBusinessQuery(
        tenantContext
    );
};


// =====================================================
// ADD PRODUCT FILTER
// =====================================================
//
// Use when you already have a tenant query
// and need to restrict it to one product.
//
// Example:
//
// const query = buildProductInventoryQuery(tenant);
//
// addProductFilter(query, productId);
//
// =====================================================

export const addProductFilter = (
    query,
    productId
) => {
    if (!isValidObjectId(productId)) {
        throw new Error(
            "Invalid product ID"
        );
    }

    query.product = productId;

    return query;
};


// =====================================================
// ADD BUSINESS FILTER
// =====================================================
//
// Useful mainly for Super Admin.
//
// Admin / Manager already receive their
// business through tenant context.
//
// =====================================================

export const addBusinessFilter = (
    query,
    businessId
) => {
    if (!isValidObjectId(businessId)) {
        throw new Error(
            "Invalid business ID"
        );
    }

    query.business = businessId;

    return query;
};


// =====================================================
// ADD BUSINESS TYPE FILTER
// =====================================================

export const addBusinessTypeFilter = (
    query,
    businessTypeId
) => {
    if (!isValidObjectId(businessTypeId)) {
        throw new Error(
            "Invalid business type ID"
        );
    }

    query.businessType = businessTypeId;

    return query;
};


// =====================================================
// ADD BRAND FILTER
// =====================================================

export const addBrandFilter = (
    query,
    brandId
) => {
    if (!isValidObjectId(brandId)) {
        throw new Error(
            "Invalid brand ID"
        );
    }

    query.brand = brandId;

    return query;
};


// =====================================================
// ADD MODEL FILTER
// =====================================================

export const addModelFilter = (
    query,
    modelId
) => {
    if (!isValidObjectId(modelId)) {
        throw new Error(
            "Invalid model ID"
        );
    }

    query.model = modelId;

    return query;
};


// =====================================================
// OBJECT ID VALIDATION
// =====================================================

export const isValidObjectId = (id) => {
    return mongoose.Types.ObjectId.isValid(id);
};


// =====================================================
// GET TENANT OWNER
// =====================================================
//
// Returns:
//
// Admin    → Admin._id
// Manager  → Admin._id
// SuperAdmin → null
//
// =====================================================

export const getTenantOwner = async (req) => {
    const tenant =
        await getTenantContext(req);

    return tenant.tenantOwner;
};


// =====================================================
// GET FULL TENANT CONTEXT
// =====================================================
//
// Convenience helper.
//
// =====================================================

export const getTenantBusinessContext = async (
    req
) => {
    return await getTenantContext(req);
};
