import Customer from "../models/Customer.js";
import Business from "../models/Business.js";
import BusinessType from "../models/BusinessType.js";

import {
    errorResponse,
    successResponse,
} from "../utils/apiResponse.js";

import {
    getTenantContext,
    buildTenantQuery,
    buildTenantBusinessQuery,
    isValidObjectId,
} from "../utils/tenantContext.js";


// ======================================================
// HELPERS
// ======================================================

// ------------------------------------------------------
// GET SUPER ADMIN STATUS
// ------------------------------------------------------

const getSuperAdminContext = async (req) => {
    const tenantContext =
        await getTenantContext(req);

    if (!tenantContext.isSuperAdmin) {
        return null;
    }

    return tenantContext;
};


// ======================================================
// VALIDATE BUSINESS
// ======================================================

const validateBusiness = async (
    businessId
) => {
    if (
        !businessId ||
        !isValidObjectId(businessId)
    ) {
        return null;
    }

    return Business.findOne({
        _id: businessId,
        isActive: true,
    });
};


// ======================================================
// VALIDATE BUSINESS TYPE
// ======================================================
//
// BusinessType must belong to the selected Business.
//

const validateBusinessType = async (
    businessTypeId,
    businessId
) => {
    if (
        !businessTypeId ||
        !isValidObjectId(businessTypeId) ||
        !businessId ||
        !isValidObjectId(businessId)
    ) {
        return null;
    }

    return BusinessType.findOne({
        _id: businessTypeId,
        business: businessId,
        isActive: true,
    });
};


// ======================================================
// GET SUPER ADMIN FILTER
// ======================================================
//
// Super Admin can optionally use:
//
// ?business=...
// ?businessType=...
//
// These are only filters.
//
// They are NOT used as tenant isolation.
//

const getSuperAdminFilter = async (req) => {
    const tenant =
        await getSuperAdminContext(req);

    if (!tenant) {
        return null;
    }

    const businessId =
        req.query?.business || null;

    const businessTypeId =
        req.query?.businessType || null;

    // --------------------------------------------------
    // No filters
    // --------------------------------------------------

    if (
        !businessId &&
        !businessTypeId
    ) {
        return {};
    }

    // --------------------------------------------------
    // Validate Business ID
    // --------------------------------------------------

    if (
        businessId &&
        !isValidObjectId(businessId)
    ) {
        throw new Error(
            "Invalid business ID."
        );
    }

    // --------------------------------------------------
    // Validate Business Type ID
    // --------------------------------------------------

    if (
        businessTypeId &&
        !isValidObjectId(businessTypeId)
    ) {
        throw new Error(
            "Invalid business type ID."
        );
    }

    // --------------------------------------------------
    // Validate Business
    // --------------------------------------------------

    if (businessId) {
        const business =
            await validateBusiness(
                businessId
            );

        if (!business) {
            throw new Error(
                "Business not found or inactive."
            );
        }
    }

    // --------------------------------------------------
    // Validate Business Type
    // --------------------------------------------------

    if (businessTypeId) {
        const businessType =
            await BusinessType.findOne({
                _id: businessTypeId,

                ...(businessId
                    ? {
                        business: businessId,
                    }
                    : {}),

                isActive: true,
            });

        if (!businessType) {
            throw new Error(
                "Business type not found, inactive, or does not belong to the selected business."
            );
        }
    }

    // --------------------------------------------------
    // Build filter
    // --------------------------------------------------

    const filter = {};

    if (businessId) {
        filter.business = businessId;
    }

    if (businessTypeId) {
        filter.businessType =
            businessTypeId;
    }

    return filter;
};


// ======================================================
// GET CUSTOMER TENANT QUERY
// ======================================================
//
// Admin / Manager:
//
// {
//     tenantOwner: Admin._id
// }
//
// Super Admin:
//
// {
//     business?: ...,
//     businessType?: ...
// }
//
// ======================================================

const getCustomerTenantQuery = async (
    req
) => {
    const tenant =
        await getTenantContext(req);

    // --------------------------------------------------
    // SUPER ADMIN
    // --------------------------------------------------

    if (tenant.isSuperAdmin) {
        return buildTenantBusinessQuery(
            {
                ...tenant,
                ...(await getSuperAdminFilter(
                    req
                )),
            }
        );
    }

    // --------------------------------------------------
    // ADMIN / MANAGER
    // --------------------------------------------------

    if (!tenant.tenantOwner) {
        return null;
    }

    // --------------------------------------------------
    // IMPORTANT
    //
    // tenantOwner is the real security boundary.
    //
    // business/businessType are only additional
    // context filters.
    // --------------------------------------------------

    return buildTenantBusinessQuery(
        tenant
    );
};


// ======================================================
// CREATE CUSTOMER
// ======================================================

export const createCustomer = async (
    req,
    res,
    next
) => {
    try {
        const {
            name,
            phone,
            alternatePhone,
            email,
            address,
            city,
            country,
            openingBalance,
            creditLimit,
            isActive,
            notes,
        } = req.body;

        // --------------------------------------------------
        // Validate Name
        // --------------------------------------------------

        if (
            !name ||
            !name.toString().trim()
        ) {
            return errorResponse(
                res,
                400,
                "Customer name is required."
            );
        }

        // --------------------------------------------------
        // Get Tenant Context
        // --------------------------------------------------

        const tenant =
            await getTenantContext(req);

        let tenantOwner;
        let businessId;
        let businessTypeId;

        // ==================================================
        // SUPER ADMIN
        // ==================================================

        if (tenant.isSuperAdmin) {
            // Super Admin must explicitly select
            // the target business and business type.

            businessId =
                req.body.business ||
                req.query.business ||
                null;

            businessTypeId =
                req.body.businessType ||
                req.query.businessType ||
                null;

            if (!businessId) {
                return errorResponse(
                    res,
                    400,
                    "Business is required."
                );
            }

            if (!businessTypeId) {
                return errorResponse(
                    res,
                    400,
                    "Business type is required."
                );
            }

            // ------------------------------------------------
            // Super Admin needs a tenant owner.
            //
            // Customer is an operational tenant record.
            // Therefore we cannot create it without knowing
            // which Admin owns it.
            //
            // ------------------------------------------------

            tenantOwner =
                req.body.tenantOwner ||
                req.query.tenantOwner ||
                null;

            if (!tenantOwner) {
                return errorResponse(
                    res,
                    400,
                    "Tenant owner is required when Super Admin creates a customer."
                );
            }

            if (
                !isValidObjectId(
                    tenantOwner
                )
            ) {
                return errorResponse(
                    res,
                    400,
                    "Invalid tenant owner ID."
                );
            }
        }

        // ==================================================
        // ADMIN / MANAGER
        // ==================================================

        else {
            // ------------------------------------------------
            // NEVER trust tenantOwner/business/businessType
            // from request body.
            // ------------------------------------------------

            tenantOwner =
                tenant.tenantOwner;

            businessId =
                tenant.business;

            businessTypeId =
                tenant.businessType;

            if (!tenantOwner) {
                return errorResponse(
                    res,
                    400,
                    "No valid tenant is assigned to this user."
                );
            }

            if (
                !businessId ||
                !businessTypeId
            ) {
                return errorResponse(
                    res,
                    400,
                    "No valid business and business type are assigned to this user."
                );
            }
        }

        // --------------------------------------------------
        // Validate IDs
        // --------------------------------------------------

        if (
            !isValidObjectId(
                tenantOwner
            )
        ) {
            return errorResponse(
                res,
                400,
                "Invalid tenant owner ID."
            );
        }

        if (
            !isValidObjectId(
                businessId
            )
        ) {
            return errorResponse(
                res,
                400,
                "Invalid business ID."
            );
        }

        if (
            !isValidObjectId(
                businessTypeId
            )
        ) {
            return errorResponse(
                res,
                400,
                "Invalid business type ID."
            );
        }

        // --------------------------------------------------
        // Validate Business
        // --------------------------------------------------

        const business =
            await validateBusiness(
                businessId
            );

        if (!business) {
            return errorResponse(
                res,
                404,
                "Business not found or inactive."
            );
        }

        // --------------------------------------------------
        // Validate Business Type
        // --------------------------------------------------

        const businessType =
            await validateBusinessType(
                businessTypeId,
                businessId
            );

        if (!businessType) {
            return errorResponse(
                res,
                404,
                "Business type not found, inactive, or does not belong to the selected business."
            );
        }

        // --------------------------------------------------
        // Duplicate Customer Check
        //
        // Duplicate is only inside:
        //
        // tenantOwner
        // + business
        // + businessType
        // + name
        //
        // Therefore:
        //
        // Admin A + IT + Mobiles + Ali
        //
        // and
        //
        // Admin B + IT + Mobiles + Ali
        //
        // are both allowed.
        // --------------------------------------------------

        const existingCustomer =
            await Customer.findOne({
                tenantOwner,
                business: businessId,
                businessType:
                    businessTypeId,
                name: name
                    .toString()
                    .trim(),
            });

        if (existingCustomer) {
            return errorResponse(
                res,
                409,
                "A customer with this name already exists in this business type."
            );
        }

        // --------------------------------------------------
        // Create Customer
        // --------------------------------------------------

        const customer =
            await Customer.create({
                tenantOwner,

                business: businessId,

                businessType:
                    businessTypeId,

                name: name
                    .toString()
                    .trim(),

                phone:
                    phone?.toString().trim() ||
                    "",

                alternatePhone:
                    alternatePhone
                        ?.toString()
                        .trim() || "",

                email:
                    email
                        ?.toString()
                        .trim()
                        .toLowerCase() || "",

                address:
                    address
                        ?.toString()
                        .trim() || "",

                city:
                    city?.toString().trim() ||
                    "",

                country:
                    country?.toString().trim() ||
                    "Pakistan",

                openingBalance:
                    openingBalance ?? 0,

                creditLimit:
                    creditLimit ?? 0,

                isActive:
                    isActive ?? true,

                notes:
                    notes?.toString().trim() ||
                    "",

                createdBy:
                    req.user._id,
            });

        // --------------------------------------------------
        // Populate Response
        // --------------------------------------------------

        await customer.populate([
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
                select: "name business",
            },
            {
                path: "createdBy",
                select: "name email",
            },
        ]);

        return successResponse(
            res,
            201,
            "Customer created successfully.",
            customer
        );
    } catch (error) {
        // --------------------------------------------------
        // Duplicate MongoDB Index
        // --------------------------------------------------

        if (error?.code === 11000) {
            return errorResponse(
                res,
                409,
                "A customer with this name already exists in this business type."
            );
        }

        next(error);
    }
};


// ======================================================
// GET ALL CUSTOMERS
// ======================================================

export const getAllCustomers = async (
    req,
    res,
    next
) => {
    try {
        const {
            search,
            city,
            isActive,
            page = 1,
            limit = 20,
        } = req.query;

        // --------------------------------------------------
        // Get Tenant Query
        // --------------------------------------------------

        const tenantQuery =
            await getCustomerTenantQuery(
                req
            );

        if (!tenantQuery) {
            return errorResponse(
                res,
                400,
                "No valid tenant is assigned to this user."
            );
        }

        // --------------------------------------------------
        // Build Query
        // --------------------------------------------------

        const query = {
            ...tenantQuery,
        };

        // --------------------------------------------------
        // Search
        // --------------------------------------------------

        if (search?.trim()) {
            const escapedSearch =
                search
                    .trim()
                    .replace(
                        /[.*+?^${}()|[\]\\]/g,
                        "\\$&"
                    );

            const searchRegex =
                new RegExp(
                    escapedSearch,
                    "i"
                );

            query.$or = [
                {
                    name: searchRegex,
                },
                {
                    phone: searchRegex,
                },
                {
                    alternatePhone:
                        searchRegex,
                },
                {
                    email: searchRegex,
                },
            ];
        }

        // --------------------------------------------------
        // City Filter
        // --------------------------------------------------

        if (city?.trim()) {
            const escapedCity =
                city
                    .trim()
                    .replace(
                        /[.*+?^${}()|[\]\\]/g,
                        "\\$&"
                    );

            query.city =
                new RegExp(
                    `^${escapedCity}$`,
                    "i"
                );
        }

        // --------------------------------------------------
        // Active Filter
        // --------------------------------------------------

        if (
            isActive !== undefined
        ) {
            query.isActive =
                isActive === "true";
        }

        // --------------------------------------------------
        // Pagination
        // --------------------------------------------------

        const pageNumber =
            Math.max(
                Number(page) || 1,
                1
            );

        const limitNumber =
            Math.min(
                Math.max(
                    Number(limit) || 20,
                    1
                ),
                100
            );

        const skip =
            (pageNumber - 1) *
            limitNumber;

        // --------------------------------------------------
        // Fetch Customers
        // --------------------------------------------------

        const [
            customers,
            total,
        ] = await Promise.all([
            Customer.find(query)
                .populate(
                    "tenantOwner",
                    "name email"
                )
                .populate(
                    "business",
                    "name"
                )
                .populate(
                    "businessType",
                    "name business"
                )
                .populate(
                    "createdBy",
                    "name email"
                )
                .populate(
                    "updatedBy",
                    "name email"
                )
                .sort({
                    createdAt: -1,
                })
                .skip(skip)
                .limit(limitNumber)
                .lean(),

            Customer.countDocuments(
                query
            ),
        ]);

        return successResponse(
            res,
            200,
            "Customers fetched successfully.",
            {
                customers,

                pagination: {
                    total,
                    page: pageNumber,
                    limit: limitNumber,
                    totalPages:
                        Math.ceil(
                            total /
                            limitNumber
                        ),
                },
            }
        );
    } catch (error) {
        next(error);
    }
};


// ======================================================
// GET CUSTOMER BY ID
// ======================================================

export const getCustomerById = async (
    req,
    res,
    next
) => {
    try {
        const { id } =
            req.params;

        // --------------------------------------------------
        // Validate ID
        // --------------------------------------------------

        if (
            !isValidObjectId(id)
        ) {
            return errorResponse(
                res,
                400,
                "Invalid customer ID."
            );
        }

        // --------------------------------------------------
        // Tenant Query
        // --------------------------------------------------

        const tenantQuery =
            await getCustomerTenantQuery(
                req
            );

        if (!tenantQuery) {
            return errorResponse(
                res,
                400,
                "No valid tenant is assigned to this user."
            );
        }

        // --------------------------------------------------
        // Find Customer
        //
        // IMPORTANT:
        //
        // Admin A:
        //
        // _id = Admin B customer's ID
        // tenantOwner = Admin A
        //
        // Result = null
        //
        // Therefore Admin A cannot access Admin B.
        // --------------------------------------------------

        const customer =
            await Customer.findOne({
                _id: id,
                ...tenantQuery,
            })
                .populate(
                    "tenantOwner",
                    "name email"
                )
                .populate(
                    "business",
                    "name"
                )
                .populate(
                    "businessType",
                    "name business"
                )
                .populate(
                    "createdBy",
                    "name email"
                )
                .populate(
                    "updatedBy",
                    "name email"
                );

        if (!customer) {
            return errorResponse(
                res,
                404,
                "Customer not found."
            );
        }

        return successResponse(
            res,
            200,
            "Customer fetched successfully.",
            customer
        );
    } catch (error) {
        next(error);
    }
};


// ======================================================
// UPDATE CUSTOMER
// ======================================================

export const updateCustomer = async (
    req,
    res,
    next
) => {
    try {
        const { id } =
            req.params;

        // --------------------------------------------------
        // Validate ID
        // --------------------------------------------------

        if (
            !isValidObjectId(id)
        ) {
            return errorResponse(
                res,
                400,
                "Invalid customer ID."
            );
        }

        // --------------------------------------------------
        // Tenant Query
        // --------------------------------------------------

        const tenantQuery =
            await getCustomerTenantQuery(
                req
            );

        if (!tenantQuery) {
            return errorResponse(
                res,
                400,
                "No valid tenant is assigned to this user."
            );
        }

        // --------------------------------------------------
        // Find Customer WITH tenant ownership
        // --------------------------------------------------

        const customer =
            await Customer.findOne({
                _id: id,
                ...tenantQuery,
            });

        if (!customer) {
            return errorResponse(
                res,
                404,
                "Customer not found."
            );
        }

        // --------------------------------------------------
        // Allowed Fields
        // --------------------------------------------------
        //
        // tenantOwner
        // business
        // businessType
        // createdBy
        //
        // are intentionally NOT allowed.
        //
        // This prevents tenant reassignment.
        // --------------------------------------------------

        const allowedFields = [
            "name",
            "phone",
            "alternatePhone",
            "email",
            "address",
            "city",
            "country",
            "openingBalance",
            "creditLimit",
            "isActive",
            "notes",
        ];

        // --------------------------------------------------
        // Duplicate Customer Name
        // --------------------------------------------------

        if (
            req.body.name !==
            undefined
        ) {
            const newName =
                req.body.name
                    ?.toString()
                    .trim();

            if (!newName) {
                return errorResponse(
                    res,
                    400,
                    "Customer name cannot be empty."
                );
            }

            const duplicateCustomer =
                await Customer.findOne({
                    _id: {
                        $ne: id,
                    },

                    tenantOwner:
                        customer.tenantOwner,

                    business:
                        customer.business,

                    businessType:
                        customer.businessType,

                    name: newName,
                });

            if (duplicateCustomer) {
                return errorResponse(
                    res,
                    409,
                    "A customer with this name already exists in this business type."
                );
            }
        }

        // --------------------------------------------------
        // Update Allowed Fields
        // --------------------------------------------------

        for (
            const field of allowedFields
        ) {
            if (
                req.body[field] !==
                undefined
            ) {
                if (
                    typeof req.body[field] ===
                    "string"
                ) {
                    customer[field] =
                        req.body[field].trim();
                } else {
                    customer[field] =
                        req.body[field];
                }
            }
        }

        // --------------------------------------------------
        // Normalize Email
        // --------------------------------------------------

        if (customer.email) {
            customer.email =
                customer.email
                    .trim()
                    .toLowerCase();
        }

        // --------------------------------------------------
        // Audit
        // --------------------------------------------------

        customer.updatedBy =
            req.user._id;

        await customer.save();

        // --------------------------------------------------
        // Populate Response
        // --------------------------------------------------

        await customer.populate([
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
                select: "name business",
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

        return successResponse(
            res,
            200,
            "Customer updated successfully.",
            customer
        );
    } catch (error) {
        // --------------------------------------------------
        // Duplicate MongoDB Index
        // --------------------------------------------------

        if (error?.code === 11000) {
            return errorResponse(
                res,
                409,
                "A customer with this name already exists in this business type."
            );
        }

        next(error);
    }
};


// ======================================================
// DELETE CUSTOMER
// ======================================================

export const deleteCustomer = async (
    req,
    res,
    next
) => {
    try {
        const { id } =
            req.params;

        // --------------------------------------------------
        // Validate ID
        // --------------------------------------------------

        if (
            !isValidObjectId(id)
        ) {
            return errorResponse(
                res,
                400,
                "Invalid customer ID."
            );
        }

        // --------------------------------------------------
        // Tenant Query
        // --------------------------------------------------

        const tenantQuery =
            await getCustomerTenantQuery(
                req
            );

        if (!tenantQuery) {
            return errorResponse(
                res,
                400,
                "No valid tenant is assigned to this user."
            );
        }

        // --------------------------------------------------
        // Find Customer WITH Tenant
        // --------------------------------------------------

        const customer =
            await Customer.findOne({
                _id: id,
                ...tenantQuery,
            });

        if (!customer) {
            return errorResponse(
                res,
                404,
                "Customer not found."
            );
        }

        // --------------------------------------------------
        // Soft Delete
        // --------------------------------------------------

        customer.isActive = false;

        customer.updatedBy =
            req.user._id;

        await customer.save();

        return successResponse(
            res,
            200,
            "Customer deleted successfully.",
            {
                customerId:
                    customer._id,
            }
        );
    } catch (error) {
        next(error);
    }
};


// ======================================================
// RESTORE CUSTOMER
// ======================================================

export const restoreCustomer = async (
    req,
    res,
    next
) => {
    try {
        const { id } =
            req.params;

        // --------------------------------------------------
        // Validate ID
        // --------------------------------------------------

        if (
            !isValidObjectId(id)
        ) {
            return errorResponse(
                res,
                400,
                "Invalid customer ID."
            );
        }

        // --------------------------------------------------
        // Tenant Query
        // --------------------------------------------------

        const tenantQuery =
            await getCustomerTenantQuery(
                req
            );

        if (!tenantQuery) {
            return errorResponse(
                res,
                400,
                "No valid tenant is assigned to this user."
            );
        }

        // --------------------------------------------------
        // Find Customer WITH Tenant
        // --------------------------------------------------

        const customer =
            await Customer.findOne({
                _id: id,
                ...tenantQuery,
            });

        if (!customer) {
            return errorResponse(
                res,
                404,
                "Customer not found."
            );
        }

        // --------------------------------------------------
        // Restore
        // --------------------------------------------------

        customer.isActive = true;

        customer.updatedBy =
            req.user._id;

        await customer.save();

        // --------------------------------------------------
        // Populate Response
        // --------------------------------------------------

        await customer.populate([
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
                select: "name business",
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

        return successResponse(
            res,
            200,
            "Customer restored successfully.",
            customer
        );
    } catch (error) {
        // --------------------------------------------------
        // Duplicate MongoDB Index
        // --------------------------------------------------

        if (error?.code === 11000) {
            return errorResponse(
                res,
                409,
                "A customer with this name already exists in this business type."
            );
        }

        next(error);
    }
};