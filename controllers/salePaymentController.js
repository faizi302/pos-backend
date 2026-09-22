import mongoose from "mongoose";

import SalePayment from "../models/salePayment.js";
import Sale from "../models/Sale.js";
import Customer from "../models/Customer.js";

import {
  errorResponse,
  successResponse,
} from "../utils/apiResponse.js";

import {
  getTenantContext,
  buildTenantBusinessQuery,
  isValidObjectId,
} from "../utils/tenantContext.js";

// =====================================================
// HELPERS
// =====================================================

const getScope = async (req, forCreate = false) => {
  const tenant = await getTenantContext(req);

  if (tenant.isSuperAdmin) {
    const tenantOwner =
      req.body.tenantOwner || req.query.tenantOwner;
    const business = req.body.business || req.query.business;
    const businessType =
      req.body.businessType || req.query.businessType;

    if (forCreate) {
      if (
        !tenantOwner ||
        !business ||
        !businessType ||
        !isValidObjectId(tenantOwner) ||
        !isValidObjectId(business) ||
        !isValidObjectId(businessType)
      ) {
        return null;
      }

      return {
        tenant,
        scope: { tenantOwner, business, businessType },
      };
    }

    const scope = {};
    if (tenantOwner) {
      if (!isValidObjectId(tenantOwner)) return null;
      scope.tenantOwner = tenantOwner;
    }
    if (business) {
      if (!isValidObjectId(business)) return null;
      scope.business = business;
    }
    if (businessType) {
      if (!isValidObjectId(businessType)) return null;
      scope.businessType = businessType;
    }

    return { tenant, scope };
  }

  // Admin / Manager → strict tenant isolation
  return {
    tenant,
    scope: buildTenantBusinessQuery(tenant),
  };
};

// =====================================================
// ALLOWED MANUAL PAYMENT METHODS (no live gateway)
// =====================================================
const manualPaymentMethods = [
  "cash",
  "bank",
  "card",
  "cheque",
  "jazzcash",
  "easypaisa",
  "credit",
  "other",
];

const generatePaymentNumber = async (scope, session) => {
  const lastPayment = await SalePayment.findOne(scope)
    .sort({ createdAt: -1 })
    .select("paymentNumber")
    .session(session);

  if (!lastPayment) return "PAY-000001";

  const lastNumber = parseInt(
    lastPayment.paymentNumber.replace("PAY-", ""),
    10
  );
  const nextNumber = Number.isNaN(lastNumber) ? 1 : lastNumber + 1;

  return `PAY-${String(nextNumber).padStart(6, "0")}`;
};

const recalculateSalePaymentStatus = async (saleId, scope, session) => {
  const payments = await SalePayment.find({
    sale: saleId,
    ...scope,
    status: "completed",
  })
    .select("amount")
    .session(session);

  const paidAmount = payments.reduce(
    (total, payment) => total + Number(payment.amount || 0),
    0
  );

  const sale = await Sale.findOne({
    _id: saleId,
    ...scope,
  }).session(session);

  if (!sale) throw new Error("Sale not found.");

  const totalAmount = Number(sale.totalAmount || 0);
  const dueAmount = Math.max(totalAmount - paidAmount, 0);

  sale.paidAmount = paidAmount;
  sale.dueAmount = dueAmount;
  sale.paymentStatus =
    paidAmount <= 0
      ? "unpaid"
      : paidAmount < totalAmount
        ? "partially_paid"
        : "paid";

  await sale.save({ session });

  return {
    paidAmount,
    dueAmount,
    paymentStatus: sale.paymentStatus,
  };
};

const getPayment = (id, scope) =>
  SalePayment.findOne({ _id: id, ...scope })
    .populate("tenantOwner", "name email")
    .populate("business", "name")
    .populate("businessType", "name")
    .populate(
      "sale",
      "saleNumber totalAmount paidAmount dueAmount paymentStatus"
    )
    .populate("customer", "name phone")
    .populate("createdBy", "name email")
    .populate("updatedBy", "name email");

// =====================================================
// CREATE (Simple Offline Payment)
// =====================================================

export const createSalePayment = async (req, res, next) => {
  const session = await mongoose.startSession();

  try {
    session.startTransaction();

    const scopeData = await getScope(req, true);

    if (!scopeData) {
      await session.abortTransaction();
      return errorResponse(
        res,
        400,
        "tenantOwner, business and businessType are required."
      );
    }

    const { scope } = scopeData;

    const {
      sale,
      customer,
      amount,
      currency = "PKR",
      paymentMethod = "cash",
      paymentDate,
      paymentNumber,
      referenceNumber = "",
      notes = "",
    } = req.body;

    // Only allow simple offline methods
    if (!manualPaymentMethods.includes(paymentMethod)) {
      await session.abortTransaction();
      return errorResponse(
        res,
        400,
        `Invalid payment method. Allowed: ${manualPaymentMethods.join(", ")}`
      );
    }

    const paymentAmount = Number(amount);

    if (!Number.isFinite(paymentAmount) || paymentAmount <= 0) {
      await session.abortTransaction();
      return errorResponse(
        res,
        400,
        "Payment amount must be greater than zero."
      );
    }

    if (!isValidObjectId(sale)) {
      await session.abortTransaction();
      return errorResponse(res, 400, "Invalid sale ID.");
    }

    const saleRecord = await Sale.findOne({
      _id: sale,
      ...scope,
    }).session(session);

    if (!saleRecord) {
      await session.abortTransaction();
      return errorResponse(res, 404, "Sale not found.");
    }

    if (["cancelled", "returned"].includes(saleRecord.status)) {
      await session.abortTransaction();
      return errorResponse(
        res,
        400,
        "Payment cannot be added to this sale."
      );
    }

    let customerId = customer || saleRecord.customer || null;

    if (customerId) {
      if (!isValidObjectId(customerId)) {
        await session.abortTransaction();
        return errorResponse(res, 400, "Invalid customer ID.");
      }

      const customerRecord = await Customer.findOne({
        _id: customerId,
        ...scope,
        isActive: true,
      }).session(session);

      if (!customerRecord) {
        await session.abortTransaction();
        return errorResponse(
          res,
          404,
          "Customer not found or inactive."
        );
      }

      if (
        saleRecord.customer &&
        saleRecord.customer.toString() !== customerId.toString()
      ) {
        await session.abortTransaction();
        return errorResponse(
          res,
          400,
          "Customer does not belong to this sale."
        );
      }
    }

    const existingPayments = await SalePayment.find({
      sale: saleRecord._id,
      ...scope,
      status: "completed",
    })
      .select("amount")
      .session(session);

    const paidAmount = existingPayments.reduce(
      (total, payment) => total + Number(payment.amount || 0),
      0
    );

    const remainingAmount = Math.max(
      Number(saleRecord.totalAmount || 0) - paidAmount,
      0
    );

    if (paymentAmount > remainingAmount) {
      await session.abortTransaction();
      return errorResponse(
        res,
        400,
        `Payment amount cannot exceed remaining amount of ${remainingAmount}.`
      );
    }

    const finalPaymentNumber =
      paymentNumber?.trim().toUpperCase() ||
      (await generatePaymentNumber(scope, session));

    const duplicate = await SalePayment.findOne({
      ...scope,
      paymentNumber: finalPaymentNumber,
    }).session(session);

    if (duplicate) {
      await session.abortTransaction();
      return errorResponse(res, 409, "Payment number already exists.");
    }

    const [newPayment] = await SalePayment.create(
      [
        {
          ...scope,
          sale: saleRecord._id,
          customer: customerId,
          paymentNumber: finalPaymentNumber,
          amount: paymentAmount,
          currency: currency.toUpperCase(),
          paymentMethod,
          gateway: null, // always null for offline payments
          status: "completed", // offline payments are completed immediately
          paymentDate: paymentDate || new Date(),
          referenceNumber: referenceNumber || null,
          transactionId: null,
          gatewayOrderId: null,
          gatewayPaymentId: null,
          gatewayStatus: null,
          gatewayResponse: null,
          notes: notes || "",
          createdBy: req.user._id,
        },
      ],
      { session }
    );

    const paymentSummary = await recalculateSalePaymentStatus(
      saleRecord._id,
      scope,
      session
    );

    await session.commitTransaction();

    return successResponse(res, 201, "Sale payment created successfully.", {
      payment: await getPayment(newPayment._id, scope),
      salePaymentSummary: paymentSummary,
    });
  } catch (error) {
    await session.abortTransaction();
    next(error);
  } finally {
    await session.endSession();
  }
};

// =====================================================
// GET ALL
// =====================================================

export const getAllSalePayments = async (req, res, next) => {
  try {
    const scopeData = await getScope(req);

    if (!scopeData) {
      return errorResponse(res, 400, "Invalid tenant filter.");
    }

    const { scope } = scopeData;

    const {
      page = 1,
      limit = 20,
      sale,
      customer,
      status,
      paymentMethod,
      gateway,
      currency,
      search,
      startDate,
      endDate,
    } = req.query;

    const pageNumber = Math.max(Number(page) || 1, 1);
    const limitNumber = Math.min(Math.max(Number(limit) || 20, 1), 100);

    const filter = { ...scope };

    if (sale) {
      if (!isValidObjectId(sale)) {
        return errorResponse(res, 400, "Invalid sale ID.");
      }
      filter.sale = sale;
    }

    if (customer) {
      if (!isValidObjectId(customer)) {
        return errorResponse(res, 400, "Invalid customer ID.");
      }
      filter.customer = customer;
    }

    if (status) filter.status = status;
    if (paymentMethod) filter.paymentMethod = paymentMethod;
    if (gateway) filter.gateway = gateway;
    if (currency) filter.currency = currency.toUpperCase();

    if (search) {
      const safeSearch = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      filter.$or = [
        { paymentNumber: { $regex: safeSearch, $options: "i" } },
        { referenceNumber: { $regex: safeSearch, $options: "i" } },
        { transactionId: { $regex: safeSearch, $options: "i" } },
      ];
    }

    if (startDate || endDate) {
      filter.paymentDate = {};
      if (startDate) {
        const start = new Date(startDate);
        if (Number.isNaN(start.getTime())) {
          return errorResponse(res, 400, "Invalid start date.");
        }
        filter.paymentDate.$gte = start;
      }
      if (endDate) {
        const end = new Date(endDate);
        if (Number.isNaN(end.getTime())) {
          return errorResponse(res, 400, "Invalid end date.");
        }
        end.setHours(23, 59, 59, 999);
        filter.paymentDate.$lte = end;
      }
    }

    const skip = (pageNumber - 1) * limitNumber;

    const [payments, total] = await Promise.all([
      SalePayment.find(filter)
        .populate("tenantOwner", "name email")
        .populate("business", "name")
        .populate("businessType", "name")
        .populate(
          "sale",
          "saleNumber totalAmount paidAmount dueAmount paymentStatus"
        )
        .populate("customer", "name phone")
        .populate("createdBy", "name email")
        .populate("updatedBy", "name email")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNumber),
      SalePayment.countDocuments(filter),
    ]);

    return successResponse(res, 200, "Sale payments fetched successfully.", {
      payments,
      pagination: {
        total,
        page: pageNumber,
        limit: limitNumber,
        totalPages: Math.ceil(total / limitNumber),
      },
    });
  } catch (error) {
    next(error);
  }
};

// =====================================================
// GET BY SALE
// =====================================================

export const getSalePaymentsBySale = async (req, res, next) => {
  try {
    const scopeData = await getScope(req);
    if (!scopeData) {
      return errorResponse(res, 400, "Invalid tenant filter.");
    }

    const { scope } = scopeData;
    const { saleId } = req.params;

    if (!isValidObjectId(saleId)) {
      return errorResponse(res, 400, "Invalid sale ID.");
    }

    const saleRecord = await Sale.findOne({ _id: saleId, ...scope });
    if (!saleRecord) {
      return errorResponse(res, 404, "Sale not found.");
    }

    const payments = await SalePayment.find({
      sale: saleId,
      ...scope,
    })
      .populate("customer", "name phone")
      .populate("createdBy", "name email")
      .populate("updatedBy", "name email")
      .sort({ createdAt: -1 });

    return successResponse(res, 200, "Sale payments fetched successfully.", {
      sale: {
        _id: saleRecord._id,
        saleNumber: saleRecord.saleNumber,
        totalAmount: saleRecord.totalAmount,
        paidAmount: saleRecord.paidAmount,
        dueAmount: saleRecord.dueAmount,
        paymentStatus: saleRecord.paymentStatus,
      },
      payments,
    });
  } catch (error) {
    next(error);
  }
};

// =====================================================
// GET BY ID
// =====================================================

export const getSalePaymentById = async (req, res, next) => {
  try {
    const scopeData = await getScope(req);
    if (!scopeData) {
      return errorResponse(res, 400, "Invalid tenant filter.");
    }

    const { scope } = scopeData;
    const { id } = req.params;

    if (!isValidObjectId(id)) {
      return errorResponse(res, 400, "Invalid payment ID.");
    }

    const payment = await getPayment(id, scope);
    if (!payment) {
      return errorResponse(res, 404, "Sale payment not found.");
    }

    return successResponse(
      res,
      200,
      "Sale payment fetched successfully.",
      payment
    );
  } catch (error) {
    next(error);
  }
};

// =====================================================
// UPDATE
// =====================================================

export const updateSalePayment = async (req, res, next) => {
  const session = await mongoose.startSession();

  try {
    session.startTransaction();

    const scopeData = await getScope(req);
    if (!scopeData) {
      await session.abortTransaction();
      return errorResponse(res, 400, "Invalid tenant filter.");
    }

    const { scope } = scopeData;
    const { id } = req.params;

    if (!isValidObjectId(id)) {
      await session.abortTransaction();
      return errorResponse(res, 400, "Invalid payment ID.");
    }

    const payment = await SalePayment.findOne({
      _id: id,
      ...scope,
    }).session(session);

    if (!payment) {
      await session.abortTransaction();
      return errorResponse(res, 404, "Sale payment not found.");
    }

    // Block if it was a real gateway payment
    if (payment.gateway) {
      await session.abortTransaction();
      return errorResponse(
        res,
        400,
        "Gateway payments cannot be manually updated."
      );
    }

    const saleRecord = await Sale.findOne({
      _id: payment.sale,
      ...scope,
    }).session(session);

    if (!saleRecord) {
      await session.abortTransaction();
      return errorResponse(res, 404, "Sale not found.");
    }

    if (["cancelled", "returned"].includes(saleRecord.status)) {
      await session.abortTransaction();
      return errorResponse(
        res,
        400,
        "Payment cannot be updated for this sale."
      );
    }

    const { paymentDate, amount, paymentMethod, referenceNumber, notes } =
      req.body;

    if (
      paymentMethod !== undefined &&
      !manualPaymentMethods.includes(paymentMethod)
    ) {
      await session.abortTransaction();
      return errorResponse(
        res,
        400,
        `Invalid payment method. Allowed: ${manualPaymentMethods.join(", ")}`
      );
    }

    if (amount !== undefined) {
      const newAmount = Number(amount);
      if (!Number.isFinite(newAmount) || newAmount <= 0) {
        await session.abortTransaction();
        return errorResponse(
          res,
          400,
          "Payment amount must be greater than zero."
        );
      }

      const otherPayments = await SalePayment.find({
        sale: payment.sale,
        ...scope,
        _id: { $ne: payment._id },
        status: "completed",
      })
        .select("amount")
        .session(session);

      const otherPaidAmount = otherPayments.reduce(
        (total, item) => total + Number(item.amount || 0),
        0
      );

      if (otherPaidAmount + newAmount > Number(saleRecord.totalAmount || 0)) {
        await session.abortTransaction();
        return errorResponse(
          res,
          400,
          "Updated payment would exceed the sale total."
        );
      }

      payment.amount = newAmount;
    }

    if (paymentDate !== undefined) payment.paymentDate = paymentDate;
    if (paymentMethod !== undefined) payment.paymentMethod = paymentMethod;
    if (referenceNumber !== undefined)
      payment.referenceNumber = referenceNumber;
    if (notes !== undefined) payment.notes = notes;

    payment.updatedBy = req.user._id;
    await payment.save({ session });

    const paymentSummary = await recalculateSalePaymentStatus(
      saleRecord._id,
      scope,
      session
    );

    await session.commitTransaction();

    return successResponse(res, 200, "Sale payment updated successfully.", {
      payment: await getPayment(payment._id, scope),
      salePaymentSummary: paymentSummary,
    });
  } catch (error) {
    await session.abortTransaction();
    next(error);
  } finally {
    await session.endSession();
  }
};

// =====================================================
// CANCEL
// =====================================================

export const cancelSalePayment = async (req, res, next) => {
  const session = await mongoose.startSession();

  try {
    session.startTransaction();

    const scopeData = await getScope(req);
    if (!scopeData) {
      await session.abortTransaction();
      return errorResponse(res, 400, "Invalid tenant filter.");
    }

    const { scope } = scopeData;
    const { id } = req.params;

    if (!isValidObjectId(id)) {
      await session.abortTransaction();
      return errorResponse(res, 400, "Invalid payment ID.");
    }

    const payment = await SalePayment.findOne({
      _id: id,
      ...scope,
    }).session(session);

    if (!payment) {
      await session.abortTransaction();
      return errorResponse(res, 404, "Sale payment not found.");
    }

    if (payment.gateway) {
      await session.abortTransaction();
      return errorResponse(
        res,
        400,
        "Gateway payments cannot be cancelled through this endpoint."
      );
    }

    if (payment.status === "cancelled") {
      await session.abortTransaction();
      return errorResponse(res, 400, "Payment is already cancelled.");
    }

    payment.status = "cancelled";
    payment.updatedBy = req.user._id;
    await payment.save({ session });

    const paymentSummary = await recalculateSalePaymentStatus(
      payment.sale,
      scope,
      session
    );

    await session.commitTransaction();

    return successResponse(res, 200, "Sale payment cancelled successfully.", {
      payment,
      salePaymentSummary: paymentSummary,
    });
  } catch (error) {
    await session.abortTransaction();
    next(error);
  } finally {
    await session.endSession();
  }
};

// =====================================================
// DELETE (blocked)
// =====================================================

export const deleteSalePayment = async (req, res) => {
  return errorResponse(
    res,
    400,
    "Sale payments should not be permanently deleted. Cancel the payment instead."
  );
};