import Category from "../models/Category.js";
import Business from "../models/Business.js";
import BusinessType from "../models/BusinessType.js";
import User from "../models/User.js";

import {
    uploadToCloudinary,
    deleteFromCloudinary,
} from "../utils/cloudinaryUpload.js";

import {
    successResponse,
    errorResponse,
} from "../utils/apiResponse.js";

import {
    getTenantContext,
    buildTenantBusinessQuery,
    isValidObjectId,
} from "../utils/tenantContext.js";

// ======================================================
// HELPERS
// ======================================================

// ------------------------------------------------------
// Escape Regex
// ------------------------------------------------------

const escapeRegex = (value = "") => {
    return value.replace(
        /[.*+?^${}()|[\]\\]/g,
        "\\$&"
    );
};

// ------------------------------------------------------
// Validate Business
// ------------------------------------------------------

const validateBusiness = async (businessId) => {
    if (!businessId) {
        return {
            valid: false,
            message: "Business is required",
        };
    }

    if (!isValidObjectId(businessId)) {
        return {
            valid: false,
            message: "Invalid business ID",
        };
    }

    const business = await Business.findOne({
        _id: businessId,
        isActive: true,
    }).select("_id name");

    if (!business) {
        return {
            valid: false,
            message: "Business not found or inactive",
        };
    }

    return {
        valid: true,
        business,
    };
};

// ------------------------------------------------------
// Validate Business Type
// ------------------------------------------------------

const validateBusinessType = async (
    businessTypeId,
    businessId
) => {
    if (!businessTypeId) {
        return {
            valid: false,
            message: "Business type is required",
        };
    }

    if (!isValidObjectId(businessTypeId)) {
        return {
            valid: false,
            message: "Invalid business type ID",
        };
    }

    const businessType =
        await BusinessType.findOne({
            _id: businessTypeId,
            business: businessId,
            isActive: true,
        }).select("_id name business");

    if (!businessType) {
        return {
            valid: false,
            message:
                "Business type not found, inactive, or does not belong to the selected business",
        };
    }

    return {
        valid: true,
        businessType,
    };
};

// ======================================================
// SUPER ADMIN TARGET TENANT VALIDATION
// ======================================================
//
// Super Admin can create/manage records for an Admin.
//
// Example:
//
// tenantOwner = Admin A
// business = Information Technology
// businessType = Mobiles
//
// We verify that the selected Admin actually belongs
// to the selected Business + BusinessType.
//

const validateSuperAdminTenant = async (
    tenantOwner,
    business,
    businessType
) => {
    if (!tenantOwner) {
        return {
            valid: false,
            message: "Tenant owner is required",
        };
    }

    if (!isValidObjectId(tenantOwner)) {
        return {
            valid: false,
            message: "Invalid tenant owner ID",
        };
    }

    const admin = await User.findById(
        tenantOwner
    )
        .select(
            "_id role business businessType status"
        )
        .populate({
            path: "role",
            select: "slug",
        });

    if (!admin) {
        return {
            valid: false,
            message: "Tenant owner not found",
        };
    }

    if (
        !admin.role ||
        admin.role.slug?.toLowerCase() !== "admin"
    ) {
        return {
            valid: false,
            message:
                "Tenant owner must be an Admin account",
        };
    }

    if (admin.status !== "active") {
        return {
            valid: false,
            message:
                "Tenant owner account is not active",
        };
    }

    if (
        !admin.business ||
        admin.business.toString() !==
            business.toString()
    ) {
        return {
            valid: false,
            message:
                "Selected business does not belong to the Admin tenant",
        };
    }

    if (
        !admin.businessType ||
        admin.businessType.toString() !==
            businessType.toString()
    ) {
        return {
            valid: false,
            message:
                "Selected business type does not belong to the Admin tenant",
        };
    }

    return {
        valid: true,
        admin,
    };
};

// ======================================================
// GET CATEGORY TENANT QUERY
// ======================================================
//
// SUPER ADMIN
// → Can access all tenants.
//
// ADMIN
// → tenantOwner = Admin._id
//
// MANAGER
// → tenantOwner = Manager.createdBy
//             = Admin._id
//
// Admin/Manager cannot override tenantOwner,
// business, or businessType using query parameters.
//

const getCategoryTenantQuery = async (req) => {
    const tenant =
        await getTenantContext(req);

    // ==================================================
    // SUPER ADMIN
    // ==================================================

    if (tenant.isSuperAdmin) {
        const query = {};

        // Optional business filter
        if (req.query.business) {
            if (
                !isValidObjectId(
                    req.query.business
                )
            ) {
                throw new Error(
                    "Invalid business ID"
                );
            }

            query.business =
                req.query.business;
        }

        // Optional business type filter
        if (req.query.businessType) {
            if (
                !isValidObjectId(
                    req.query.businessType
                )
            ) {
                throw new Error(
                    "Invalid business type ID"
                );
            }

            query.businessType =
                req.query.businessType;
        }

        // Optional tenant owner filter
        if (req.query.tenantOwner) {
            if (
                !isValidObjectId(
                    req.query.tenantOwner
                )
            ) {
                throw new Error(
                    "Invalid tenant owner ID"
                );
            }

            query.tenantOwner =
                req.query.tenantOwner;
        }

        return {
            tenant,
            query,
        };
    }

    // ==================================================
    // ADMIN / MANAGER
    // ==================================================
    //
    // Tenant information comes only from the
    // authenticated tenant context.
    //
    // req.query values are NOT trusted.
    //

    return {
        tenant,
        query: buildTenantBusinessQuery(
            tenant
        ),
    };
};

// ======================================================
// CREATE CATEGORY
// ======================================================

export const createCategory = async (
    req,
    res
) => {
    try {
        const tenant =
            await getTenantContext(req);

        let tenantOwner;
        let business;
        let businessType;

        // ==================================================
        // SUPER ADMIN
        // ==================================================

        if (tenant.isSuperAdmin) {
            tenantOwner =
                req.body.tenantOwner;

            business =
                req.body.business;

            businessType =
                req.body.businessType;

            if (!tenantOwner) {
                return errorResponse(
                    res,
                    400,
                    "Tenant owner is required"
                );
            }

            if (!business) {
                return errorResponse(
                    res,
                    400,
                    "Business is required"
                );
            }

            if (!businessType) {
                return errorResponse(
                    res,
                    400,
                    "Business type is required"
                );
            }

            const tenantValidation =
                await validateSuperAdminTenant(
                    tenantOwner,
                    business,
                    businessType
                );

            if (!tenantValidation.valid) {
                return errorResponse(
                    res,
                    400,
                    tenantValidation.message
                );
            }
        }

        // ==================================================
        // ADMIN / MANAGER
        // ==================================================

        else {
            tenantOwner =
                tenant.tenantOwner;

            business =
                tenant.business;

            businessType =
                tenant.businessType;

            if (!tenantOwner) {
                return errorResponse(
                    res,
                    400,
                    "Tenant owner is required"
                );
            }

            if (!business) {
                return errorResponse(
                    res,
                    400,
                    "Business is not assigned to this account"
                );
            }

            if (!businessType) {
                return errorResponse(
                    res,
                    400,
                    "Business type is not assigned to this account"
                );
            }
        }

        // ==================================================
        // VALIDATE BUSINESS
        // ==================================================

        const businessValidation =
            await validateBusiness(
                business
            );

        if (!businessValidation.valid) {
            return errorResponse(
                res,
                400,
                businessValidation.message
            );
        }

        // ==================================================
        // VALIDATE BUSINESS TYPE
        // ==================================================

        const businessTypeValidation =
            await validateBusinessType(
                businessType,
                business
            );

        if (!businessTypeValidation.valid) {
            return errorResponse(
                res,
                400,
                businessTypeValidation.message
            );
        }

        // ==================================================
        // CATEGORY NAME
        // ==================================================

        const name =
            req.body.name?.trim();

        if (!name) {
            return errorResponse(
                res,
                400,
                "Category name is required"
            );
        }

        // ==================================================
        // DUPLICATE CHECK
        // ==================================================

        const existingCategory =
            await Category.findOne({
                tenantOwner,
                business,
                businessType,
                name: {
                    $regex: `^${escapeRegex(
                        name
                    )}$`,
                    $options: "i",
                },
            });

        if (existingCategory) {
            return errorResponse(
                res,
                409,
                "Category with this name already exists"
            );
        }

        // ==================================================
        // IMAGE
        // ==================================================

        let image = {
            url: null,
            publicId: null,
            assetId: null,
        };

        if (req.file) {
            const uploaded =
                await uploadToCloudinary(
                    req.file.buffer,
                    "pos/categories"
                );

            image = {
                url:
                    uploaded?.secure_url ||
                    null,

                publicId:
                    uploaded?.public_id ||
                    null,

                assetId:
                    uploaded?.asset_id ||
                    null,
            };
        }

        // ==================================================
        // SLUG
        // ==================================================

        const slug =
            req.body.slug?.trim() ||
            name
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, "-")
                .replace(/(^-|-$)/g, "");

        // ==================================================
        // CREATE CATEGORY
        // ==================================================

        const category =
            await Category.create({
                tenantOwner,

                business,

                businessType,

                name,

                slug,

                description:
                    req.body.description?.trim() ||
                    "",

                image,

                isActive:
                    req.body.isActive !==
                    undefined
                        ? req.body.isActive
                        : true,

                createdBy:
                    req.user._id,
            });

        // ==================================================
        // POPULATE
        // ==================================================

        await category.populate([
            {
                path: "tenantOwner",
                select: "name email",
            },
            {
                path: "business",
                select: "name",
            },
            {
                path: "businessType",
                select: "name",
            },
            {
                path: "createdBy",
                select: "name email",
            },
        ]);

        return successResponse(
            res,
            201,
            "Category created successfully",
            category
        );
    } catch (error) {
        console.error(
            "Create Category Error:",
            error
        );

        if (error.code === 11000) {
            return errorResponse(
                res,
                409,
                "Category with this name already exists for this tenant"
            );
        }

        return errorResponse(
            res,
            500,
            error.message ||
                "Failed to create category"
        );
    }
};

// ======================================================
// GET ALL CATEGORIES
// ======================================================

export const getAllCategories = async (
    req,
    res
) => {
    try {
        const {
            query: tenantQuery,
        } =
            await getCategoryTenantQuery(
                req
            );

        // ==================================================
        // FILTERS
        // ==================================================

        const query = {
            ...tenantQuery,
        };

        // --------------------------------------------------
        // SEARCH
        // --------------------------------------------------

        if (req.query.search) {
            const search =
                escapeRegex(
                    req.query.search.trim()
                );

            query.$or = [
                {
                    name: {
                        $regex: search,
                        $options: "i",
                    },
                },
                {
                    description: {
                        $regex: search,
                        $options: "i",
                    },
                },
            ];
        }

        // --------------------------------------------------
        // ACTIVE STATUS
        // --------------------------------------------------

        if (
            req.query.isActive !==
            undefined
        ) {
            query.isActive =
                req.query.isActive ===
                "true";
        }

        // --------------------------------------------------
        // BUSINESS FILTER
        // --------------------------------------------------
        //
        // Only useful for Super Admin because
        // Admin/Manager already have business locked
        // by tenant context.
        //

        if (
            req.query.business &&
            tenantQuery.business ===
                undefined
        ) {
            query.business =
                req.query.business;
        }

        // --------------------------------------------------
        // BUSINESS TYPE FILTER
        // --------------------------------------------------

        if (
            req.query.businessType &&
            tenantQuery.businessType ===
                undefined
        ) {
            query.businessType =
                req.query.businessType;
        }

        // ==================================================
        // PAGINATION
        // ==================================================

        const page = Math.max(
            Number(req.query.page) || 1,
            1
        );

        const limit = Math.min(
            Math.max(
                Number(req.query.limit) || 10,
                1
            ),
            100
        );

        const skip =
            (page - 1) * limit;

        // ==================================================
        // SORT
        // ==================================================

        const sort = {
            createdAt: -1,
        };

        // ==================================================
        // QUERY
        // ==================================================

        const [
            categories,
            total,
        ] = await Promise.all([
            Category.find(query)
                .populate({
                    path: "tenantOwner",
                    select: "name email",
                })
                .populate({
                    path: "business",
                    select: "name",
                })
                .populate({
                    path: "businessType",
                    select: "name",
                })
                .populate({
                    path: "createdBy",
                    select: "name email",
                })
                .populate({
                    path: "updatedBy",
                    select: "name email",
                })
                .sort(sort)
                .skip(skip)
                .limit(limit)
                .lean(),

            Category.countDocuments(query),
        ]);

        // ==================================================
        // RESPONSE
        // ==================================================

        return successResponse(
            res,
            200,
            "Categories fetched successfully",
            {
                categories,

                pagination: {
                    total,
                    page,
                    limit,
                    totalPages:
                        Math.ceil(
                            total / limit
                        ),
                },
            }
        );
    } catch (error) {
        console.error(
            "Get All Categories Error:",
            error
        );

        return errorResponse(
            res,
            500,
            error.message ||
                "Failed to fetch categories"
        );
    }
};

// ======================================================
// GET CATEGORY BY ID
// ======================================================

export const getCategoryById = async (
    req,
    res
) => {
    try {
        const categoryId =
            req.params.id;

        // ==================================================
        // VALIDATE ID
        // ==================================================

        if (
            !isValidObjectId(
                categoryId
            )
        ) {
            return errorResponse(
                res,
                400,
                "Invalid category ID"
            );
        }

        // ==================================================
        // TENANT QUERY
        // ==================================================

        const {
            query: tenantQuery,
        } =
            await getCategoryTenantQuery(
                req
            );

        // ==================================================
        // FIND CATEGORY
        // ==================================================

        const category =
            await Category.findOne({
                _id: categoryId,
                ...tenantQuery,
            })
                .populate({
                    path: "tenantOwner",
                    select: "name email",
                })
                .populate({
                    path: "business",
                    select: "name",
                })
                .populate({
                    path: "businessType",
                    select: "name",
                })
                .populate({
                    path: "createdBy",
                    select: "name email",
                })
                .populate({
                    path: "updatedBy",
                    select: "name email",
                });

        if (!category) {
            return errorResponse(
                res,
                404,
                "Category not found"
            );
        }

        // ==================================================
        // RESPONSE
        // ==================================================

        return successResponse(
            res,
            200,
            "Category fetched successfully",
            category
        );
    } catch (error) {
        console.error(
            "Get Category Error:",
            error
        );

        return errorResponse(
            res,
            500,
            error.message ||
                "Failed to fetch category"
        );
    }
};

// ======================================================
// UPDATE CATEGORY
// ======================================================

export const updateCategory = async (
    req,
    res
) => {
    try {
        const categoryId =
            req.params.id;

        // ==================================================
        // VALIDATE ID
        // ==================================================

        if (
            !isValidObjectId(
                categoryId
            )
        ) {
            return errorResponse(
                res,
                400,
                "Invalid category ID"
            );
        }

        // ==================================================
        // TENANT QUERY
        // ==================================================

        const {
            query: tenantQuery,
        } =
            await getCategoryTenantQuery(
                req
            );

        // ==================================================
        // FIND CATEGORY WITH TENANT ISOLATION
        // ==================================================

        const category =
            await Category.findOne({
                _id: categoryId,
                ...tenantQuery,
            });

        if (!category) {
            return errorResponse(
                res,
                404,
                "Category not found"
            );
        }

        // ==================================================
        // UPDATE NAME
        // ==================================================

        if (
            req.body.name !== undefined
        ) {
            const name =
                req.body.name.trim();

            if (!name) {
                return errorResponse(
                    res,
                    400,
                    "Category name cannot be empty"
                );
            }

            // ----------------------------------------------
            // DUPLICATE CHECK
            // ----------------------------------------------

            const duplicate =
                await Category.findOne({
                    _id: {
                        $ne: categoryId,
                    },

                    tenantOwner:
                        category.tenantOwner,

                    business:
                        category.business,

                    businessType:
                        category.businessType,

                    name: {
                        $regex: `^${escapeRegex(
                            name
                        )}$`,
                        $options: "i",
                    },
                });

            if (duplicate) {
                return errorResponse(
                    res,
                    409,
                    "Category with this name already exists"
                );
            }

            category.name = name;

            // Generate slug from updated name
            category.slug =
                req.body.slug?.trim() ||
                name
                    .toLowerCase()
                    .replace(
                        /[^a-z0-9]+/g,
                        "-"
                    )
                    .replace(
                        /(^-|-$)/g,
                        ""
                    );
        }

        // ==================================================
        // SLUG
        // ==================================================

        if (
            req.body.slug !==
                undefined &&
            req.body.name === undefined
        ) {
            category.slug =
                req.body.slug.trim();
        }

        // ==================================================
        // DESCRIPTION
        // ==================================================

        if (
            req.body.description !==
            undefined
        ) {
            category.description =
                req.body.description.trim();
        }

        // ==================================================
        // STATUS
        // ==================================================

        if (
            req.body.isActive !==
            undefined
        ) {
            category.isActive =
                req.body.isActive;
        }

        // ==================================================
        // IMAGE
        // ==================================================

        if (req.file) {
            // ----------------------------------------------
            // DELETE OLD IMAGE
            // ----------------------------------------------

            if (
                category.image?.publicId
            ) {
                try {
                    await deleteFromCloudinary(
                        category.image
                            .publicId
                    );
                } catch (
                    deleteError
                ) {
                    console.error(
                        "Old category image delete error:",
                        deleteError
                    );
                }
            }

            // ----------------------------------------------
            // UPLOAD NEW IMAGE
            // ----------------------------------------------

            const uploaded =
                await uploadToCloudinary(
                    req.file.buffer,
                    "pos/categories"
                );

            category.image = {
                url:
                    uploaded?.secure_url ||
                    null,

                publicId:
                    uploaded?.public_id ||
                    null,

                assetId:
                    uploaded?.asset_id ||
                    null,
            };
        }

        // ==================================================
        // TENANT SECURITY
        // ==================================================
        //
        // We intentionally DO NOT update:
        //
        // tenantOwner
        // business
        // businessType
        // createdBy
        //
        // This prevents an Admin/Manager from moving
        // a category to another tenant.
        //
        // ==================================================

        category.updatedBy =
            req.user._id;

        await category.save();

        // ==================================================
        // POPULATE
        // ==================================================

        await category.populate([
            {
                path: "tenantOwner",
                select: "name email",
            },
            {
                path: "business",
                select: "name",
            },
            {
                path: "businessType",
                select: "name",
            },
            {
                path: "createdBy",
                select: "name email",
            },
            {
                path: "updatedBy",
                select: "name email",
            },
        ]);

        // ==================================================
        // RESPONSE
        // ==================================================

        return successResponse(
            res,
            200,
            "Category updated successfully",
            category
        );
    } catch (error) {
        console.error(
            "Update Category Error:",
            error
        );

        if (error.code === 11000) {
            return errorResponse(
                res,
                409,
                "Category with this name already exists for this tenant"
            );
        }

        return errorResponse(
            res,
            500,
            error.message ||
                "Failed to update category"
        );
    }
};

// ======================================================
// DELETE CATEGORY
// ======================================================
//
// Soft delete only.
// isActive becomes false.
//

export const deleteCategory = async (
    req,
    res
) => {
    try {
        const categoryId =
            req.params.id;

        // ==================================================
        // VALIDATE ID
        // ==================================================

        if (
            !isValidObjectId(
                categoryId
            )
        ) {
            return errorResponse(
                res,
                400,
                "Invalid category ID"
            );
        }

        // ==================================================
        // TENANT QUERY
        // ==================================================

        const {
            query: tenantQuery,
        } =
            await getCategoryTenantQuery(
                req
            );

        // ==================================================
        // FIND CATEGORY
        // ==================================================

        const category =
            await Category.findOne({
                _id: categoryId,
                ...tenantQuery,
            });

        if (!category) {
            return errorResponse(
                res,
                404,
                "Category not found"
            );
        }

        // ==================================================
        // SOFT DELETE
        // ==================================================

        category.isActive = false;

        category.updatedBy =
            req.user._id;

        await category.save();

        // ==================================================
        // RESPONSE
        // ==================================================

        return successResponse(
            res,
            200,
            "Category deleted successfully",
            category
        );
    } catch (error) {
        console.error(
            "Delete Category Error:",
            error
        );

        return errorResponse(
            res,
            500,
            error.message ||
                "Failed to delete category"
        );
    }
};

// ======================================================
// RESTORE CATEGORY
// ======================================================

export const restoreCategory = async (
    req,
    res
) => {
    try {
        const categoryId =
            req.params.id;

        // ==================================================
        // VALIDATE ID
        // ==================================================

        if (
            !isValidObjectId(
                categoryId
            )
        ) {
            return errorResponse(
                res,
                400,
                "Invalid category ID"
            );
        }

        // ==================================================
        // TENANT QUERY
        // ==================================================

        const {
            query: tenantQuery,
        } =
            await getCategoryTenantQuery(
                req
            );

        // ==================================================
        // FIND CATEGORY
        // ==================================================

        const category =
            await Category.findOne({
                _id: categoryId,
                ...tenantQuery,
            });

        if (!category) {
            return errorResponse(
                res,
                404,
                "Category not found"
            );
        }

        // ==================================================
        // RESTORE
        // ==================================================

        category.isActive = true;

        category.updatedBy =
            req.user._id;

        await category.save();

        // ==================================================
        // RESPONSE
        // ==================================================

        return successResponse(
            res,
            200,
            "Category restored successfully",
            category
        );
    } catch (error) {
        console.error(
            "Restore Category Error:",
            error
        );

        return errorResponse(
            res,
            500,
            error.message ||
                "Failed to restore category"
        );
    }
};