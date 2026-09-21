import mongoose from "mongoose";

import CashRegister from "../models/CashRegister.js";
import SalePayment from "../models/salePayment.js";
import Expense from "../models/Expense.js";
import SaleReturn from "../models/SaleReturn.js";
import User from "../models/User.js";

import {
    successResponse,
    errorResponse,
} from "../utils/apiResponse.js";

import {
    getTenantContext,
    isValidObjectId,
} from "../utils/tenantContext.js";

// =====================================================
// CONSTANTS
// =====================================================

const SUPER_ADMIN_ROLE = "super-admin";
const ADMIN_ROLE = "admin";
const MANAGER_ROLE = "manager";

// =====================================================
// ROLE HELPERS
// =====================================================

const getRoleSlug = (user) => {
    return user?.role?.slug || user?.role || null;
};

const isSuperAdmin = (user) => {
    return getRoleSlug(user) === SUPER_ADMIN_ROLE;
};

// =====================================================
// PARSE NUMBER
// =====================================================

const parseNumber = (value) => {
    if (
        value === undefined ||
        value === null ||
        value === ""
    ) {
        return null;
    }

    const number = Number(value);

    if (!Number.isFinite(number)) {
        return null;
    }

    return number;
};

// =====================================================
// ESCAPE REGEX
// =====================================================

const escapeRegex = (value) => {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
};

// =====================================================
// VALIDATE DATE
// =====================================================

const parseDate = (value) => {
    if (!value) {
        return null;
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return null;
    }

    return date;
};

// =====================================================
// GET SUPER ADMIN TARGET TENANT
// =====================================================

const getSuperAdminTenant = async (tenantOwnerId) => {
    if (!tenantOwnerId) {
        throw new Error(
            "Tenant owner is required for Super Admin."
        );
    }

    if (!isValidObjectId(tenantOwnerId)) {
        throw new Error("Invalid tenant owner ID.");
    }

    const admin = await User.findById(tenantOwnerId)
        .select(
            "_id name email role business businessType status"
        )
        .populate({
            path: "role",
            select: "slug isActive",
        });

    if (!admin) {
        throw new Error("Tenant owner Admin not found.");
    }

    const roleSlug = admin.role?.slug || admin.role;

    if (roleSlug !== ADMIN_ROLE) {
        throw new Error(
            "Selected tenant owner must be an Admin."
        );
    }

    if (admin.status !== "active") {
        throw new Error(
            "Selected Admin account is not active."
        );
    }

    if (!admin.business) {
        throw new Error(
            "Selected Admin is not assigned to a business."
        );
    }

    if (!admin.businessType) {
        throw new Error(
            "Selected Admin is not assigned to a business type."
        );
    }

    return {
        isSuperAdmin: true,
        tenantOwner: admin._id,
        business: admin.business,
        businessType: admin.businessType,
        admin,
    };
};

// =====================================================
// RESOLVE TENANT CONTEXT
// =====================================================

const resolveTenant = async (req, options = {}) => {
    const {
        requireTenantForSuperAdmin = false,
    } = options;

    const tenantContext = await getTenantContext(req);

    // =================================================
    // SUPER ADMIN
    // =================================================

    if (tenantContext.isSuperAdmin) {
        const tenantOwnerId =
            req.body?.tenantOwner ||
            req.query?.tenantOwner ||
            null;

        if (
            requireTenantForSuperAdmin &&
            !tenantOwnerId
        ) {
            throw new Error(
                "Tenant owner is required for this operation."
            );
        }

        // Super Admin without selected tenant
        // can view all registers.
        if (!tenantOwnerId) {
            return {
                ...tenantContext,
                tenantOwner: null,
                business: null,
                businessType: null,
                admin: null,
            };
        }

        return getSuperAdminTenant(tenantOwnerId);
    }

    // =================================================
    // ADMIN / MANAGER
    // =================================================
    //
    // getTenantContext() is responsible for resolving:
    //
    // Admin:
    //   tenantOwner = Admin
    //   business = Admin business
    //   businessType = Admin businessType
    //
    // Manager:
    //   tenantOwner = Manager's Admin
    //   business = Admin business
    //   businessType = Admin businessType
    //
    return tenantContext;
};

// =====================================================
// BUILD REGISTER TENANT QUERY
// =====================================================

const buildRegisterTenantQuery = (tenantContext) => {
    // -----------------------------------------------
    // SUPER ADMIN WITHOUT SELECTED TENANT
    // -----------------------------------------------

    if (
        tenantContext.isSuperAdmin &&
        !tenantContext.tenantOwner
    ) {
        return {};
    }

    // -----------------------------------------------
    // TENANT REQUIRED
    // -----------------------------------------------

    if (!tenantContext.tenantOwner) {
        throw new Error(
            "Tenant owner is required."
        );
    }

    return {
        tenantOwner: tenantContext.tenantOwner,
    };
};

// =====================================================
// BUILD TRANSACTION TENANT QUERY
// =====================================================

const buildTransactionTenantQuery = (tenantContext) => {
    if (
        tenantContext.isSuperAdmin &&
        !tenantContext.tenantOwner
    ) {
        return {};
    }

    if (!tenantContext.tenantOwner) {
        throw new Error(
            "Tenant owner is required."
        );
    }

    return {
        tenantOwner: tenantContext.tenantOwner,
    };
};

// =====================================================
// GENERATE REGISTER NUMBER
// =====================================================
//
// IMPORTANT:
// Register numbers are generated PER TENANT.
//
// Tenant A:
//   REG-000001
//
// Tenant B:
//   REG-000001
//
// This is valid because the database uniqueness is:
//
// tenantOwner + registerNumber
//
// =====================================================

const generateRegisterNumber = async (tenantOwner) => {
    if (!tenantOwner) {
        throw new Error(
            "Tenant owner is required to generate register number."
        );
    }

    const tenantObjectId =
        new mongoose.Types.ObjectId(tenantOwner);

    const result = await CashRegister.aggregate([
        {
            $match: {
                tenantOwner: tenantObjectId,
            },
        },

        {
            $project: {
                num: {
                    $convert: {
                        input: {
                            $arrayElemAt: [
                                {
                                    $split: [
                                        "$registerNumber",
                                        "-",
                                    ],
                                },
                                1,
                            ],
                        },
                        to: "int",
                        onError: 0,
                        onNull: 0,
                    },
                },
            },
        },

        {
            $group: {
                _id: null,
                maxNum: {
                    $max: "$num",
                },
            },
        },
    ]);

    const nextNumber =
        (result[0]?.maxNum || 0) + 1;

    return `REG-${String(nextNumber).padStart(6, "0")}`;
};

// =====================================================
// CALCULATE EXPECTED BALANCE
// =====================================================

const calculateExpectedBalance = (register) => {
    return (
        register.openingBalance +
        register.cashSales +
        register.cashIn -
        register.cashExpenses -
        register.cashRefunds -
        register.cashOut
    );
};

// =====================================================
// REFRESH REGISTER TOTALS
// =====================================================

const refreshRegisterTotals = async (register) => {
    const tenantOwner = register.tenantOwner;
    const businessId = register.business;
    const openedAt = register.openedAt;
    const endDate =
        register.closedAt || new Date();

    if (!tenantOwner) {
        throw new Error(
            "Register tenant owner is missing."
        );
    }

    if (!businessId) {
        throw new Error(
            "Register business is missing."
        );
    }

    const tenantObjectId =
        new mongoose.Types.ObjectId(
            tenantOwner
        );

    const businessObjectId =
        new mongoose.Types.ObjectId(
            businessId
        );

    // =================================================
    // CASH SALES
    // =================================================

    const salesResult =
        await SalePayment.aggregate([
            {
                $match: {
                    tenantOwner: tenantObjectId,
                    business: businessObjectId,
                    status: "completed",
                    paymentMethod: "cash",
                    paymentDate: {
                        $gte: openedAt,
                        $lte: endDate,
                    },
                },
            },

            {
                $group: {
                    _id: null,
                    total: {
                        $sum: "$amount",
                    },
                },
            },
        ]);

    // =================================================
    // CASH EXPENSES
    // =================================================

    const expenseResult =
        await Expense.aggregate([
            {
                $match: {
                    tenantOwner: tenantObjectId,
                    business: businessObjectId,
                    status: "paid",
                    paymentMethod: "cash",
                    expenseDate: {
                        $gte: openedAt,
                        $lte: endDate,
                    },
                },
            },

            {
                $group: {
                    _id: null,
                    total: {
                        $sum: "$amount",
                    },
                },
            },
        ]);

    // =================================================
    // CASH REFUNDS
    // =================================================

    const refundResult =
        await SaleReturn.aggregate([
            {
                $match: {
                    tenantOwner: tenantObjectId,
                    business: businessObjectId,
                    status: "completed",
                    refundStatus: "refunded",
                    refundAmount: {
                        $gt: 0,
                    },
                    returnDate: {
                        $gte: openedAt,
                        $lte: endDate,
                    },
                },
            },

            {
                $group: {
                    _id: null,
                    total: {
                        $sum: "$refundAmount",
                    },
                },
            },
        ]);

    // =================================================
    // UPDATE TOTALS
    // =================================================

    register.cashSales =
        salesResult[0]?.total || 0;

    register.cashExpenses =
        expenseResult[0]?.total || 0;

    register.cashRefunds =
        refundResult[0]?.total || 0;

    register.expectedClosingBalance =
        calculateExpectedBalance(register);

    await register.save();

    return register;
};

// =====================================================
// OPEN CASH REGISTER
// =====================================================

export const openCashRegister = async (
    req,
    res,
    next
) => {
    try {
        const tenant = await resolveTenant(req, {
            requireTenantForSuperAdmin: true,
        });

        const {
            tenantOwner,
            business,
        } = tenant;

        // =================================================
        // TENANT VALIDATION
        // =================================================

        if (!tenantOwner) {
            return errorResponse(
                res,
                400,
                "Tenant owner is required."
            );
        }

        if (!business) {
            return errorResponse(
                res,
                400,
                "Business is required."
            );
        }

        // =================================================
        // OPENING BALANCE
        // =================================================

        const openingBalance =
            parseNumber(
                req.body.openingBalance
            );

        if (
            openingBalance === null ||
            openingBalance < 0
        ) {
            return errorResponse(
                res,
                400,
                "Opening balance must be a valid non-negative number."
            );
        }

        // =================================================
        // ONE OPEN REGISTER PER TENANT
        // =================================================

        const existingRegister =
            await CashRegister.findOne({
                tenantOwner,
                status: "open",
            });

        if (existingRegister) {
            return errorResponse(
                res,
                409,
                "A cash register is already open for this tenant."
            );
        }

        // =================================================
        // REGISTER USER
        // =================================================

        let registerUser = req.user._id;

        // Super Admin may explicitly select
        // Admin/Manager as register user.
        //
        // Normal Admin/Manager cannot override
        // req.user through request body.
        //

        if (
            isSuperAdmin(req.user) &&
            req.body.user
        ) {
            if (
                !isValidObjectId(req.body.user)
            ) {
                return errorResponse(
                    res,
                    400,
                    "Invalid register user ID."
                );
            }

            const targetUser =
                await User.findOne({
                    _id: req.body.user,
                    status: "active",
                })
                    .select(
                        "_id role createdBy business businessType"
                    )
                    .populate({
                        path: "role",
                        select: "slug",
                    });

            if (!targetUser) {
                return errorResponse(
                    res,
                    404,
                    "Register user not found or inactive."
                );
            }

            const targetRole =
                targetUser.role?.slug ||
                targetUser.role;

            // ---------------------------------------------
            // MANAGER
            // ---------------------------------------------

            if (
                targetRole === MANAGER_ROLE
            ) {
                if (
                    !targetUser.createdBy ||
                    targetUser.createdBy.toString() !==
                        tenantOwner.toString()
                ) {
                    return errorResponse(
                        res,
                        403,
                        "Register user does not belong to the selected tenant."
                    );
                }
            }

            // ---------------------------------------------
            // ADMIN
            // ---------------------------------------------

            else if (
                targetRole === ADMIN_ROLE
            ) {
                if (
                    targetUser._id.toString() !==
                    tenantOwner.toString()
                ) {
                    return errorResponse(
                        res,
                        403,
                        "Register user does not belong to the selected tenant."
                    );
                }
            }

            // ---------------------------------------------
            // OTHER ROLES
            // ---------------------------------------------

            else {
                return errorResponse(
                    res,
                    403,
                    "Only Admin or Manager can be assigned as register user."
                );
            }

            registerUser =
                targetUser._id;
        }

        // =================================================
        // CREATE REGISTER
        // =================================================
        //
        // The database compound index:
        //
        // tenantOwner + registerNumber
        //
        // guarantees uniqueness per tenant.
        //
        // Retry protects against two requests arriving
        // at exactly the same time.
        //

        let register = null;

        let attempts = 0;

        const maxAttempts = 5;

        while (
            attempts < maxAttempts
        ) {
            attempts++;

            const registerNumber =
                await generateRegisterNumber(
                    tenantOwner
                );

            try {
                register =
                    await CashRegister.create({
                        tenantOwner,
                        business,
                        user: registerUser,
                        registerNumber,
                        openingBalance,

                        cashSales: 0,
                        cashExpenses: 0,
                        cashRefunds: 0,
                        cashIn: 0,
                        cashOut: 0,

                        expectedClosingBalance:
                            openingBalance,

                        notes:
                            typeof req.body.notes ===
                                "string"
                                ? req.body.notes.trim()
                                : "",

                        openedBy:
                            req.user._id,
                    });

                break;
            } catch (err) {
                // Retry only duplicate-key errors.
                if (
                    err.code === 11000 &&
                    attempts < maxAttempts
                ) {
                    continue;
                }

                throw err;
            }
        }

        // =================================================
        // FAILED TO CREATE
        // =================================================

        if (!register) {
            return errorResponse(
                res,
                500,
                "Failed to generate a unique register number after several attempts."
            );
        }

        // =================================================
        // RESPONSE
        // =================================================

        await register.populate([
            {
                path: "business",
                select: "name",
            },
            {
                path: "user",
                select: "name email phone",
            },
            {
                path: "openedBy",
                select: "name email",
            },
        ]);

        return successResponse(
            res,
            201,
            "Cash register opened successfully.",
            register
        );
    } catch (error) {
        // =================================================
        // DUPLICATE KEY
        // =================================================

        if (error.code === 11000) {
            return errorResponse(
                res,
                409,
                "A cash register with this register number already exists for this tenant."
            );
        }

        next(error);
    }
};

// =====================================================
// GET CURRENT OPEN REGISTER
// =====================================================

export const getCurrentCashRegister = async (
    req,
    res,
    next
) => {
    try {
        const tenant =
            await resolveTenant(req);

        const filter =
            buildRegisterTenantQuery(
                tenant
            );

        filter.status = "open";

        const register =
            await CashRegister.findOne(
                filter
            )
                .populate(
                    "business",
                    "name"
                )
                .populate(
                    "user",
                    "name email phone"
                )
                .populate(
                    "openedBy",
                    "name email"
                )
                .populate(
                    "closedBy",
                    "name email"
                );

        if (!register) {
            return errorResponse(
                res,
                404,
                "No open cash register found."
            );
        }

        const refreshedRegister =
            await refreshRegisterTotals(
                register
            );

        return successResponse(
            res,
            200,
            "Current cash register fetched successfully.",
            refreshedRegister
        );
    } catch (error) {
        next(error);
    }
};

// =====================================================
// ADD CASH IN
// =====================================================

export const addCashIn = async (
    req,
    res,
    next
) => {
    try {
        const tenant =
            await resolveTenant(req, {
                requireTenantForSuperAdmin: true,
            });

        const filter =
            buildRegisterTenantQuery(
                tenant
            );

        filter.status = "open";

        const register =
            await CashRegister.findOne(
                filter
            );

        if (!register) {
            return errorResponse(
                res,
                404,
                "No open cash register found."
            );
        }

        const amount =
            parseNumber(
                req.body.amount
            );

        if (
            amount === null ||
            amount <= 0
        ) {
            return errorResponse(
                res,
                400,
                "Cash in amount must be greater than zero."
            );
        }

        register.cashIn += amount;

        if (
            typeof req.body.notes ===
                "string" &&
            req.body.notes.trim()
        ) {
            register.notes =
                req.body.notes.trim();
        }

        register.expectedClosingBalance =
            calculateExpectedBalance(
                register
            );

        await register.save();

        return successResponse(
            res,
            200,
            "Cash added successfully.",
            register
        );
    } catch (error) {
        next(error);
    }
};

// =====================================================
// ADD CASH OUT
// =====================================================

export const addCashOut = async (
    req,
    res,
    next
) => {
    try {
        const tenant =
            await resolveTenant(req, {
                requireTenantForSuperAdmin: true,
            });

        const filter =
            buildRegisterTenantQuery(
                tenant
            );

        filter.status = "open";

        const register =
            await CashRegister.findOne(
                filter
            );

        if (!register) {
            return errorResponse(
                res,
                404,
                "No open cash register found."
            );
        }

        const amount =
            parseNumber(
                req.body.amount
            );

        if (
            amount === null ||
            amount <= 0
        ) {
            return errorResponse(
                res,
                400,
                "Cash out amount must be greater than zero."
            );
        }

        register.cashOut += amount;

        if (
            typeof req.body.notes ===
                "string" &&
            req.body.notes.trim()
        ) {
            register.notes =
                req.body.notes.trim();
        }

        register.expectedClosingBalance =
            calculateExpectedBalance(
                register
            );

        if (
            register.expectedClosingBalance <
            0
        ) {
            return errorResponse(
                res,
                400,
                "Cash out cannot make expected balance negative."
            );
        }

        await register.save();

        return successResponse(
            res,
            200,
            "Cash removed successfully.",
            register
        );
    } catch (error) {
        next(error);
    }
};

// =====================================================
// CLOSE CASH REGISTER
// =====================================================

export const closeCashRegister = async (
    req,
    res,
    next
) => {
    try {
        const tenant =
            await resolveTenant(req, {
                requireTenantForSuperAdmin: true,
            });

        const filter =
            buildRegisterTenantQuery(
                tenant
            );

        filter.status = "open";

        let register =
            await CashRegister.findOne(
                filter
            );

        if (!register) {
            return errorResponse(
                res,
                404,
                "No open cash register found."
            );
        }

        // =================================================
        // REFRESH TRANSACTION TOTALS
        // =================================================

        register =
            await refreshRegisterTotals(
                register
            );

        // =================================================
        // ACTUAL CLOSING BALANCE
        // =================================================

        const actualClosingBalance =
            parseNumber(
                req.body.actualClosingBalance
            );

        if (
            actualClosingBalance === null ||
            actualClosingBalance < 0
        ) {
            return errorResponse(
                res,
                400,
                "Actual closing balance must be a valid non-negative number."
            );
        }

        // =================================================
        // CLOSE REGISTER
        // =================================================

        register.closedAt =
            new Date();

        register.status = "closed";

        register.actualClosingBalance =
            actualClosingBalance;

        register.expectedClosingBalance =
            calculateExpectedBalance(
                register
            );

        register.difference =
            actualClosingBalance -
            register.expectedClosingBalance;

        register.closedBy =
            req.user._id;

        if (
            typeof req.body.notes ===
                "string" &&
            req.body.notes.trim()
        ) {
            register.notes =
                req.body.notes.trim();
        }

        await register.save();

        await register.populate([
            {
                path: "business",
                select: "name",
            },
            {
                path: "user",
                select: "name email phone",
            },
            {
                path: "openedBy",
                select: "name email",
            },
            {
                path: "closedBy",
                select: "name email",
            },
        ]);

        return successResponse(
            res,
            200,
            "Cash register closed successfully.",
            register
        );
    } catch (error) {
        next(error);
    }
};

// =====================================================
// GET ALL CASH REGISTERS
// =====================================================

export const getAllCashRegisters = async (
    req,
    res,
    next
) => {
    try {
        const tenant =
            await resolveTenant(req);

        const {
            page = 1,
            limit = 20,
            status,
            user,
            startDate,
            endDate,
            search,
        } = req.query;

        const filter =
            buildRegisterTenantQuery(
                tenant
            );

        // =================================================
        // SUPER ADMIN BUSINESS FILTER
        // =================================================

        if (
            tenant.isSuperAdmin &&
            !tenant.tenantOwner &&
            req.query.business
        ) {
            if (
                !isValidObjectId(
                    req.query.business
                )
            ) {
                return errorResponse(
                    res,
                    400,
                    "Invalid business ID."
                );
            }

            filter.business =
                req.query.business;
        }

        // =================================================
        // STATUS
        // =================================================

        if (status) {
            if (
                !["open", "closed"].includes(
                    status
                )
            ) {
                return errorResponse(
                    res,
                    400,
                    "Invalid register status."
                );
            }

            filter.status = status;
        }

        // =================================================
        // USER
        // =================================================

        if (user) {
            if (
                !isValidObjectId(user)
            ) {
                return errorResponse(
                    res,
                    400,
                    "Invalid user ID."
                );
            }

            filter.user = user;
        }

        // =================================================
        // START DATE
        // =================================================

        if (startDate) {
            const parsedStartDate =
                parseDate(startDate);

            if (!parsedStartDate) {
                return errorResponse(
                    res,
                    400,
                    "Invalid start date."
                );
            }

            filter.openedAt = {
                $gte: parsedStartDate,
            };
        }

        // =================================================
        // END DATE
        // =================================================

        if (endDate) {
            const parsedEndDate =
                parseDate(endDate);

            if (!parsedEndDate) {
                return errorResponse(
                    res,
                    400,
                    "Invalid end date."
                );
            }

            parsedEndDate.setHours(
                23,
                59,
                59,
                999
            );

            filter.openedAt = {
                ...(filter.openedAt || {}),
                $lte: parsedEndDate,
            };
        }

        // =================================================
        // SEARCH
        // =================================================

        if (search?.trim()) {
            filter.registerNumber = {
                $regex: escapeRegex(
                    search.trim()
                ),
                $options: "i",
            };
        }

        // =================================================
        // PAGINATION
        // =================================================

        const pageNumber = Math.max(
            Number(page) || 1,
            1
        );

        const limitNumber = Math.min(
            Math.max(
                Number(limit) || 20,
                1
            ),
            100
        );

        const skip =
            (pageNumber - 1) *
            limitNumber;

        // =================================================
        // DATABASE QUERY
        // =================================================

        const [
            registers,
            total,
        ] = await Promise.all([
            CashRegister.find(filter)
                .populate(
                    "business",
                    "name"
                )
                .populate(
                    "user",
                    "name email phone"
                )
                .populate(
                    "openedBy",
                    "name email"
                )
                .populate(
                    "closedBy",
                    "name email"
                )
                .sort({
                    openedAt: -1,
                })
                .skip(skip)
                .limit(limitNumber),

            CashRegister.countDocuments(
                filter
            ),
        ]);

        return successResponse(
            res,
            200,
            "Cash registers fetched successfully.",
            {
                registers,

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

// =====================================================
// GET CASH REGISTER BY ID
// =====================================================

export const getCashRegisterById = async (
    req,
    res,
    next
) => {
    try {
        const { id } = req.params;

        if (
            !isValidObjectId(id)
        ) {
            return errorResponse(
                res,
                400,
                "Invalid cash register ID."
            );
        }

        const tenant =
            await resolveTenant(req);

        const filter =
            buildRegisterTenantQuery(
                tenant
            );

        filter._id = id;

        const register =
            await CashRegister.findOne(
                filter
            )
                .populate(
                    "business",
                    "name"
                )
                .populate(
                    "user",
                    "name email phone"
                )
                .populate(
                    "openedBy",
                    "name email"
                )
                .populate(
                    "closedBy",
                    "name email"
                );

        if (!register) {
            return errorResponse(
                res,
                404,
                "Cash register not found."
            );
        }

        return successResponse(
            res,
            200,
            "Cash register fetched successfully.",
            register
        );
    } catch (error) {
        next(error);
    }
};