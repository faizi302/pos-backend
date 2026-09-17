import mongoose from "mongoose";

import CashRegister from "../models/CashRegister.js";
import Business from "../models/Business.js";
import SalePayment from "../models/salePayment.js";
import Expense from "../models/Expense.js";
import SaleReturn from "../models/SaleReturn.js";

import {
  errorResponse,
  successResponse,
} from "../utils/apiResponse.js";

const SUPER_ADMIN_ROLE = "super-admin";

const getBusinessId = (req) => {
  if (req.user?.role?.slug === SUPER_ADMIN_ROLE) {
    return req.body?.business || req.query?.business || null;
  }

  return req.user?.business || null;
};

const isSuperAdmin = (req) => {
  return req.user?.role?.slug === SUPER_ADMIN_ROLE;
};

const validateBusiness = async (businessId) => {
  if (!businessId) {
    return {
      valid: false,
      message: "Business is required.",
    };
  }

  if (!mongoose.Types.ObjectId.isValid(businessId)) {
    return {
      valid: false,
      message: "Invalid business ID.",
    };
  }

  const business = await Business.findOne({
    _id: businessId,
    isActive: true,
  });

  if (!business) {
    return {
      valid: false,
      message: "Active business not found.",
    };
  }

  return {
    valid: true,
    business,
  };
};

const generateRegisterNumber = async (businessId) => {
  const lastRegister = await CashRegister.findOne({
    business: businessId,
  })
    .sort({ createdAt: -1 })
    .select("registerNumber");

  let nextNumber = 1;

  if (lastRegister?.registerNumber) {
    const match = lastRegister.registerNumber.match(/\d+$/);

    if (match) {
      nextNumber = Number(match[0]) + 1;
    }
  }

  return `REG-${String(nextNumber).padStart(6, "0")}`;
};

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

const refreshRegisterTotals = async (register) => {
  const businessId = register.business;
  const openedAt = register.openedAt;
  const endDate = register.closedAt || new Date();

  const salesResult = await SalePayment.aggregate([
    {
      $match: {
        business: new mongoose.Types.ObjectId(businessId),
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

  const expenseResult = await Expense.aggregate([
    {
      $match: {
        business: new mongoose.Types.ObjectId(businessId),
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

  const refundResult = await SaleReturn.aggregate([
    {
      $match: {
        business: new mongoose.Types.ObjectId(businessId),
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

  register.cashSales = salesResult[0]?.total || 0;
  register.cashExpenses = expenseResult[0]?.total || 0;
  register.cashRefunds = refundResult[0]?.total || 0;

  register.expectedClosingBalance =
    calculateExpectedBalance(register);

  await register.save();

  return register;
};

// =====================================================
// OPEN REGISTER
// =====================================================

export const openCashRegister = async (req, res, next) => {
  try {
    const businessId = getBusinessId(req);

    const businessValidation = await validateBusiness(businessId);

    if (!businessValidation.valid) {
      return errorResponse(
        res,
        400,
        businessValidation.message
      );
    }

    // Only one open register per business
    const existingRegister = await CashRegister.findOne({
      business: businessId,
      status: "open",
    });

    if (existingRegister) {
      return errorResponse(
        res,
        409,
        "A cash register is already open for this business."
      );
    }

    const registerNumber = await generateRegisterNumber(
      businessId
    );

    const register = await CashRegister.create({
      business: businessId,
      user: req.user._id,
      registerNumber,

      openingBalance: req.body.openingBalance,

      cashSales: 0,
      cashExpenses: 0,
      cashRefunds: 0,
      cashIn: 0,
      cashOut: 0,

      expectedClosingBalance: req.body.openingBalance,

      notes: req.body.notes || "",

      openedBy: req.user._id,
    });

    return successResponse(
      res,
      201,
      "Cash register opened successfully.",
      register
    );
  } catch (error) {
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
    const businessId = getBusinessId(req);

    const businessValidation = await validateBusiness(businessId);

    if (!businessValidation.valid) {
      return errorResponse(
        res,
        400,
        businessValidation.message
      );
    }

    let register = await CashRegister.findOne({
      business: businessId,
      status: "open",
    })
      .populate("user", "name email phone")
      .populate("openedBy", "name email");

    if (!register) {
      return errorResponse(
        res,
        404,
        "No open cash register found."
      );
    }

    register = await refreshRegisterTotals(register);

    return successResponse(
      res,
      200,
      "Current cash register fetched successfully.",
      register
    );
  } catch (error) {
    next(error);
  }
};

// =====================================================
// ADD CASH IN
// =====================================================

export const addCashIn = async (req, res, next) => {
  try {
    const businessId = getBusinessId(req);

    const register = await CashRegister.findOne({
      business: businessId,
      status: "open",
    });

    if (!register) {
      return errorResponse(
        res,
        404,
        "No open cash register found."
      );
    }

    register.cashIn += req.body.amount;

    if (req.body.notes) {
      register.notes = req.body.notes;
    }

    register.expectedClosingBalance =
      calculateExpectedBalance(register);

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

export const addCashOut = async (req, res, next) => {
  try {
    const businessId = getBusinessId(req);

    const register = await CashRegister.findOne({
      business: businessId,
      status: "open",
    });

    if (!register) {
      return errorResponse(
        res,
        404,
        "No open cash register found."
      );
    }

    register.cashOut += req.body.amount;

    if (req.body.notes) {
      register.notes = req.body.notes;
    }

    register.expectedClosingBalance =
      calculateExpectedBalance(register);

    if (register.expectedClosingBalance < 0) {
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
// CLOSE REGISTER
// =====================================================

export const closeCashRegister = async (req, res, next) => {
  try {
    const businessId = getBusinessId(req);

    let register = await CashRegister.findOne({
      business: businessId,
      status: "open",
    });

    if (!register) {
      return errorResponse(
        res,
        404,
        "No open cash register found."
      );
    }

    // Refresh source transaction totals
    register = await refreshRegisterTotals(register);

    register.closedAt = new Date();
    register.status = "closed";

    register.actualClosingBalance =
      req.body.actualClosingBalance;

    register.expectedClosingBalance =
      calculateExpectedBalance(register);

    register.difference =
      register.actualClosingBalance -
      register.expectedClosingBalance;

    register.closedBy = req.user._id;

    if (req.body.notes) {
      register.notes = req.body.notes;
    }

    await register.save();

    await register.populate([
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
// GET ALL REGISTERS
// =====================================================

export const getAllCashRegisters = async (
  req,
  res,
  next
) => {
  try {
    const businessId = getBusinessId(req);

    const {
      page = 1,
      limit = 20,
      status,
      user,
      startDate,
      endDate,
      search,
    } = req.query;

    const filter = {
      business: businessId,
    };

    if (status) {
      filter.status = status;
    }

    if (user && mongoose.Types.ObjectId.isValid(user)) {
      filter.user = user;
    }

    if (startDate || endDate) {
      filter.openedAt = {};

      if (startDate) {
        filter.openedAt.$gte = new Date(startDate);
      }

      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);

        filter.openedAt.$lte = end;
      }
    }

    if (search) {
      filter.registerNumber = {
        $regex: search,
        $options: "i",
      };
    }

    const pageNumber = Math.max(Number(page), 1);
    const limitNumber = Math.min(
      Math.max(Number(limit), 1),
      100
    );

    const skip = (pageNumber - 1) * limitNumber;

    const [registers, total] = await Promise.all([
      CashRegister.find(filter)
        .populate("user", "name email phone")
        .populate("openedBy", "name email")
        .populate("closedBy", "name email")
        .sort({ openedAt: -1 })
        .skip(skip)
        .limit(limitNumber),

      CashRegister.countDocuments(filter),
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
          totalPages: Math.ceil(total / limitNumber),
        },
      }
    );
  } catch (error) {
    next(error);
  }
};

// =====================================================
// GET REGISTER BY ID
// =====================================================

export const getCashRegisterById = async (
  req,
  res,
  next
) => {
  try {
    const businessId = getBusinessId(req);

    const register = await CashRegister.findOne({
      _id: req.params.id,
      business: businessId,
    })
      .populate("business", "name")
      .populate("user", "name email phone")
      .populate("openedBy", "name email")
      .populate("closedBy", "name email");

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